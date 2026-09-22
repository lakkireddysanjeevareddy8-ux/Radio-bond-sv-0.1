// Supabase Edge Function: emergency-push-dispatch
// Dispatches high-priority push notifications to registered physical phones
// when an emergency row is inserted into the emergencies table by the ESP32.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    id: number | string;
    device_id: string;
    trigger: string;
    status: string;
    created_at?: string;
    event_time?: string;
    keyword?: string;
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

    if (!record || record.status !== 'ACTIVE') {
      return new Response(JSON.stringify({ message: 'Skipped non-active emergency' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deviceId = record.device_id;
    if (!deviceId) {
      return new Response(JSON.stringify({ error: 'Missing device_id in emergency record' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch active push tokens for this device
    const { data: tokens, error: tokensErr } = await supabase
      .from('device_push_tokens')
      .select('push_token, platform, provider')
      .eq('device_id', deviceId)
      .eq('active', true);

    if (tokensErr) {
      console.error('[PushDispatch] Error querying push tokens:', tokensErr);
      return new Response(JSON.stringify({ error: tokensErr.message }), { status: 500 });
    }

    if (!tokens || tokens.length === 0) {
      console.log(`[PushDispatch] No active push tokens registered for device: ${deviceId}`);
      return new Response(
        JSON.stringify({ message: 'No registered push tokens for device', deviceId }),
        { status: 200 }
      );
    }

    // 2. Fetch device name for user-friendly alert
    const { data: dev } = await supabase
      .from('devices')
      .select('name, device_name')
      .eq('id', deviceId)
      .maybeSingle();

    const deviceName = dev?.device_name || dev?.name || `WSG-01 (${deviceId.slice(-4)})`;
    const eventId = String(record.id);
    const trigger = record.trigger || 'EMERGENCY';
    const timestamp = record.created_at || record.event_time || new Date().toISOString();

    // 3. Build Expo push notification messages
    const expoPushMessages = [];

    for (const t of tokens) {
      if (t.provider === 'expo' && t.push_token.startsWith('ExponentPushToken[')) {
        expoPushMessages.push({
          to: t.push_token,
          title: '🚨 EMERGENCY: WASHROOM SAFETY ALERT',
          body: `Emergency triggered on ${deviceName} (${trigger}). Tap to open alarm screen.`,
          sound: 'emergency_siren.wav',
          priority: 'high',
          channelId: 'emergency_alerts',
          data: {
            type: 'WSG01_EMERGENCY',
            eventId: eventId,
            deviceId: deviceId,
            deviceName: deviceName,
            trigger: trigger,
            timestamp: timestamp,
            status: 'ACTIVE',
          },
        });
      }
    }

    if (expoPushMessages.length === 0) {
      return new Response(JSON.stringify({ message: 'No valid Expo push tokens found' }), {
        status: 200,
      });
    }

    // 4. Send via Expo Push API
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
