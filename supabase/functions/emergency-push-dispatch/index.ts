// Supabase Edge Function: emergency-push-dispatch
// Dispatches high-priority push notifications to registered devices and trusted contacts
// when an emergency row is created or escalating in emergency_events or emergencies tables.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    id: number | string;
    device_id?: string;
    owner_user_id?: string;
    trigger?: string;
    source?: string;
    status: string;
    created_at?: string;
    detected_at?: string;
    event_time?: string;
    keyword?: string;
    is_test?: boolean;
    location_lat?: number;
    location_lng?: number;
    location_shared?: boolean;
    metadata?: Record<string, any>;
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey;

    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    const body: WebhookPayload = await req.json();
    const record = body.record;

    if (!record) {
      return new Response(JSON.stringify({ error: 'Missing record payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normStatus = String(record.status || '').toLowerCase();
    // Only dispatch for active, detected, or escalating emergencies
    if (normStatus !== 'active' && normStatus !== 'detected' && normStatus !== 'escalating') {
      return new Response(JSON.stringify({ message: `Skipped non-active emergency (status: ${record.status})` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deviceId = record.device_id || 'WSG-000001';
    const ownerUserId = record.owner_user_id;
    const eventId = String(record.id);

    // 1. Fetch owner settings (if ownerUserId available)
    let emergencySettings: any = null;
    if (ownerUserId) {
      const { data: s } = await supabase
        .from('emergency_settings')
        .select('*')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      emergencySettings = s;
    }

    // 2. Fetch push tokens for owner
    let ownerTokens: any[] = [];
    if (ownerUserId && (emergencySettings?.notify_owner ?? true)) {
      const { data: oDevs } = await supabase
        .from('notification_devices')
        .select('push_token, platform, user_id')
        .eq('user_id', ownerUserId)
        .eq('is_active', true);
      ownerTokens = oDevs || [];
    }

    // Also check device_push_tokens linked to this device
    const { data: legacyDeviceTokens } = await supabase
      .from('device_push_tokens')
      .select('push_token, platform, user_id')
      .eq('device_id', deviceId)
      .eq('active', true);

    // 3. Fetch trusted contacts for owner/device
    let trustedUserIds: string[] = [];
    let contactRecords: any[] = [];

    if (ownerUserId) {
      const { data: contacts } = await supabase
        .from('emergency_contacts')
        .select('id, name, email, priority, is_enabled')
        .eq('owner_user_id', ownerUserId)
        .eq('is_enabled', true)
        .order('priority', { ascending: true });

      contactRecords = contacts || [];

      if (contactRecords.length > 0) {
        const contactIds = contactRecords.map((c) => c.id);
        const { data: linked } = await supabase
          .from('trusted_contact_users')
          .select('contact_user_id, contact_id')
          .in('contact_id', contactIds)
          .eq('status', 'active');

        trustedUserIds = (linked || []).map((l: any) => l.contact_user_id).filter(Boolean);
      }
    }

    // Also check legacy trusted_contacts table
    const { data: legacyContacts } = await supabase
      .from('trusted_contacts')
      .select('contact_user_id')
      .eq('device_id', deviceId)
      .eq('status', 'accepted');

    (legacyContacts || []).forEach((c: any) => {
      if (c.contact_user_id && !trustedUserIds.includes(c.contact_user_id)) {
        trustedUserIds.push(c.contact_user_id);
      }
    });

    // 4. Fetch push tokens for trusted contact users
    let contactTokens: any[] = [];
    if (trustedUserIds.length > 0) {
      const { data: cTokens } = await supabase
        .from('notification_devices')
        .select('push_token, platform, user_id')
        .in('user_id', trustedUserIds)
        .eq('is_active', true);
      contactTokens = cTokens || [];
    }

    // Combine tokens and deduplicate
    const tokenMap = new Map<string, any>();
    for (const t of (ownerTokens || [])) {
      if (t?.push_token) tokenMap.set(t.push_token, { ...t, isOwner: true });
    }
    for (const t of (legacyDeviceTokens || [])) {
      if (t?.push_token && !tokenMap.has(t.push_token)) {
        tokenMap.set(t.push_token, { ...t, isOwner: true });
      }
    }
    for (const t of (contactTokens || [])) {
      if (t?.push_token && !tokenMap.has(t.push_token)) {
        tokenMap.set(t.push_token, { ...t, isOwner: false });
      }
    }

    const allTokens = Array.from(tokenMap.values());

    if (allTokens.length === 0) {
      console.log(`[PushDispatch] No active push tokens found for device ${deviceId} or contacts.`);
      return new Response(
        JSON.stringify({ message: 'No registered push tokens', deviceId, eventId }),
        { status: 200 }
      );
    }

    // 5. Fetch device name
    const { data: dev } = await supabase
      .from('devices')
      .select('name, device_name')
      .eq('id', deviceId)
      .maybeSingle();

    const deviceName = dev?.device_name || dev?.name || `WSG-01 (${deviceId.slice(-4)})`;
    const trigger = record.trigger || record.source || 'EMERGENCY';
    const timestamp = record.detected_at || record.created_at || record.event_time || new Date().toISOString();
    const isTest = Boolean(record.is_test || trigger === 'TEST' || record.source === 'test');

    const locationLink = record.location_shared && record.location_lat && record.location_lng
      ? `https://maps.google.com/?q=${record.location_lat},${record.location_lng}`
      : null;

    // 6. Build Expo push messages
    const expoPushMessages = [];

    for (const t of allTokens) {
      if (t.push_token && (t.push_token.startsWith('ExponentPushToken[') || t.push_token.startsWith('ExpoPushToken['))) {
        const title = isTest
          ? '🧪 TEST — WSG-01 Emergency Alert'
          : '🚨 EMERGENCY: WASHROOM SAFETY ALERT';

        const body = isTest
          ? `System test on ${deviceName}. No action required.`
          : `Emergency detected on ${deviceName} (${trigger}).${locationLink ? ' Location attached.' : ''} Tap to respond.`;

        expoPushMessages.push({
          to: t.push_token,
          title,
          body,
          sound: isTest ? 'default' : 'emergency_siren.wav',
          priority: isTest ? 'normal' : 'high',
          channelId: isTest ? 'device_maintenance' : 'emergency_alerts',
          data: {
            type: 'WSG01_EMERGENCY',
            eventId: eventId,
            deviceId: deviceId,
            deviceName: deviceName,
            trigger: trigger,
            timestamp: timestamp,
            status: record.status,
            isTest: isTest,
            locationLat: record.location_lat,
            locationLng: record.location_lng,
            locationShared: record.location_shared,
          },
        });
      }
    }

    if (expoPushMessages.length === 0) {
      return new Response(JSON.stringify({ message: 'No valid Expo push tokens found' }), {
        status: 200,
      });
    }

    // 7. Dispatch via Expo Push API
    const pushResp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPushMessages),
    });

    const pushResult = await pushResp.json();
    console.log(`[PushDispatch] Dispatched ${expoPushMessages.length} push notification(s):`, pushResult);

    // 8. Log into emergency_notifications table
    try {
      for (const t of allTokens) {
        if (t.user_id) {
          await supabase.from('emergency_notifications').insert({
            emergency_event_id: eventId.startsWith('emg_') ? undefined : eventId,
            recipient_user_id: t.user_id,
            notification_type: 'push',
            status: pushResp.ok ? 'delivered' : 'failed',
            provider_message_id: pushResult?.data?.[0]?.id,
            sent_at: new Date().toISOString(),
            delivered_at: pushResp.ok ? new Date().toISOString() : undefined,
            failed_at: !pushResp.ok ? new Date().toISOString() : undefined,
          });
        }
      }
    } catch (logErr) {
      console.warn('[PushDispatch] Could not insert emergency_notifications log:', logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatchedCount: expoPushMessages.length,
        result: pushResult,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[PushDispatch] Unexpected error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
