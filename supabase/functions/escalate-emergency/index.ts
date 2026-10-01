// Supabase Edge Function: escalate-emergency
// Escalates an emergency to enabled trusted contacts according to owner settings
// and records audit logs in emergency_notifications.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

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

    const body = await req.json();
    const eventId = body.eventId;

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Missing eventId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch emergency event
    const { data: event, error: eventErr } = await supabase
      .from('emergency_events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: 'Emergency event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if event was already acknowledged, resolved, or cancelled
    if (['acknowledged', 'resolved', 'cancelled'].includes(event.status)) {
      return new Response(
        JSON.stringify({ message: `Escalation stopped: event already ${event.status}`, eventId }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Transition status to escalating
    await supabase
      .from('emergency_events')
      .update({ status: 'escalating' })
      .eq('id', eventId);

    const ownerUserId = event.owner_user_id;
    if (!ownerUserId) {
      return new Response(JSON.stringify({ message: 'No owner associated with event', eventId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch owner's emergency settings
    const { data: settings } = await supabase
      .from('emergency_settings')
      .select('*')
      .eq('user_id', ownerUserId)
      .maybeSingle();

    const strategy = settings?.escalation_strategy || 'all';

    // 3. Fetch enabled emergency contacts
    const { data: contacts } = await supabase
      .from('emergency_contacts')
      .select('id, name, email, priority, is_enabled')
      .eq('owner_user_id', ownerUserId)
      .eq('is_enabled', true)
      .order('priority', { ascending: true });

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No enabled emergency contacts to escalate to', eventId }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Filter targets according to strategy
    let targets = contacts;
    if (strategy === 'priority') {
      const minPri = Math.min(...contacts.map((c) => c.priority));
      targets = contacts.filter((c) => c.priority === minPri);
    }

    // 5. Query linked users and their push tokens
    const contactIds = targets.map((t) => t.id);
    const { data: linkedUsers } = await supabase
      .from('trusted_contact_users')
      .select('contact_id, contact_user_id')
      .in('contact_id', contactIds)
      .eq('status', 'active');

    const contactToUserMap = new Map<string, string>();
    (linkedUsers || []).forEach((u) => {
      contactToUserMap.set(u.contact_id, u.contact_user_id);
    });

    const userIds = Array.from(contactToUserMap.values()).filter(Boolean);

    let pushTokens: any[] = [];
    if (userIds.length > 0) {
      const { data: devTokens } = await supabase
        .from('notification_devices')
        .select('push_token, user_id, platform')
        .in('user_id', userIds)
        .eq('is_active', true);

      pushTokens = devTokens || [];
    }

    // 6. Build notifications and dispatch
    const userToTokensMap = new Map<string, string[]>();
    for (const t of pushTokens) {
      if (!userToTokensMap.has(t.user_id)) {
        userToTokensMap.set(t.user_id, []);
      }
      userToTokensMap.get(t.user_id)!.push(t.push_token);
    }

    const isTest = Boolean(event.source === 'test' || event.trigger === 'TEST');
    const locationLink = event.location_shared && event.location_lat && event.location_lng
      ? `https://maps.google.com/?q=${event.location_lat},${event.location_lng}`
      : null;

    let dispatchedCount = 0;

    for (const target of targets) {
      const recipientUserId = contactToUserMap.get(target.id);

      // Check idempotency: check if already notified
      const { data: existingNotif } = await supabase
        .from('emergency_notifications')
        .select('id, status')
        .eq('emergency_event_id', eventId)
        .eq('contact_id', target.id)
        .maybeSingle();

      if (existingNotif && (existingNotif.status === 'sent' || existingNotif.status === 'delivered')) {
        continue; // Already processed
      }

      const tokens = recipientUserId ? (userToTokensMap.get(recipientUserId) || []) : [];

      if (tokens.length === 0) {
        // Record failure
        await supabase.from('emergency_notifications').insert({
          emergency_event_id: eventId,
          contact_id: target.id,
          recipient_user_id: recipientUserId,
          notification_type: 'push',
          status: 'failed',
          failure_reason: 'Recipient has not registered a push notification device in the WSG-01 app.',
        });
        continue;
      }

      const expoMessages = tokens.map((token) => ({
        to: token,
        title: isTest ? '🧪 TEST — WSG-01 Emergency Alert' : '🚨 EMERGENCY: WASHROOM SAFETY ALERT',
        body: isTest
          ? `System safety test alert. No action required.`
          : `Urgent: Emergency alert on washroom guardian (${event.trigger || 'incident'}).${locationLink ? ' Location attached.' : ''} Tap to view.`,
        sound: isTest ? 'default' : 'emergency_siren.wav',
        priority: 'high',
        channelId: 'emergency_alerts',
        data: {
          type: 'WSG01_EMERGENCY',
          eventId: eventId,
          deviceId: event.device_id,
          status: 'escalating',
          trigger: event.trigger,
          timestamp: event.detected_at,
          isTest,
          locationLat: event.location_lat,
          locationLng: event.location_lng,
          locationShared: event.location_shared,
        },
      }));

      try {
        const resp = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(expoMessages),
        });

        const result = await resp.json();
        const success = resp.ok;
        if (success) dispatchedCount += expoMessages.length;

        await supabase.from('emergency_notifications').insert({
          emergency_event_id: eventId,
          contact_id: target.id,
          recipient_user_id: recipientUserId,
          notification_type: 'push',
          status: success ? 'delivered' : 'failed',
          provider_message_id: result?.data?.[0]?.id,
          sent_at: new Date().toISOString(),
          delivered_at: success ? new Date().toISOString() : undefined,
          failed_at: !success ? new Date().toISOString() : undefined,
          failure_reason: !success ? JSON.stringify(result?.errors) : undefined,
        });
      } catch (err: any) {
        await supabase.from('emergency_notifications').insert({
          emergency_event_id: eventId,
          contact_id: target.id,
          recipient_user_id: recipientUserId,
          notification_type: 'push',
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: err.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        eventId,
        dispatchedCount,
        targetsEvaluated: targets.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[EscalateEmergency] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
