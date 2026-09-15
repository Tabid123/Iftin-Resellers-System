import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface BankTxPayload {
  TranDate?: string;
  TranNo?: string;
  AccNo?: string;
  CustomerName?: string;
  TranAmt?: number | string;
  Narration?: string;
  DrCr?: string;
  UTI?: string;
  CurrencyCode?: string;
  TranDateTime?: string;
  RrpNo?: string;
  TranDesc?: string;
  TranType?: string;
  UserId?: string;
  ChargeAmt?: number | string;
  [k: string]: any;
}

/**
 * Parse Narration like:
 *   #EX:1#613266060#By: 615103501 #REF:30701738045
 *   #615103501#By: 615103501 #REF:30701738045
 * Returns { sender, receiver }
 */
function parseNarration(narration: string): { sender: string | null; receiver: string | null } {
  if (!narration) return { sender: null, receiver: null };

  // sender: digits after "By:" (with optional spaces)
  const senderMatch = narration.match(/By\s*:\s*(\d{6,15})/i);
  const sender = senderMatch ? senderMatch[1] : null;

  // receiver: first standalone digit-group (9–15 digits) inside #...# segments,
  // skipping segments like "EX:1" which contain non-digits/colons.
  let receiver: string | null = null;
  const segments = narration.split('#');
  for (const seg of segments) {
    const trimmed = seg.trim();
    // skip "By:..." and "REF:..." and "EX:..." segments
    if (/^by\s*:/i.test(trimmed)) continue;
    if (/^ref\s*:/i.test(trimmed)) continue;
    if (/^ex\s*:/i.test(trimmed)) continue;
    // pure digits 6+ length
    if (/^\d{6,15}$/.test(trimmed)) {
      receiver = trimmed;
      break;
    }
  }

  return { sender, receiver };
}

function last9(p: string | null | undefined): string {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  return digits.slice(-9);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ message: 'Method not allowed', status: false }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Token validation
    const auth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(
        JSON.stringify({ message: 'Unauthorized', status: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: session, error: sessErr } = await supabase
      .from('bank_sessions')
      .select('id, credential_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (sessErr || !session) {
      return new Response(
        JSON.stringify({ message: 'Unauthorized', status: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ message: 'Token expired', status: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last_used_at (best-effort)
    supabase.from('bank_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id).then(() => {});

    // Parse body
    let body: BankTxPayload;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ message: 'Invalid JSON', status: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tranNo = (body.TranNo ?? '').toString().trim();
    if (!tranNo) {
      return new Response(
        JSON.stringify({ message: 'TranNo required', status: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency: if already exists, return success without re-processing
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('id, match_status')
      .eq('tran_no', tranNo)
      .maybeSingle();

    if (existing) {
      console.log(`♻️  bank-push: duplicate TranNo ${tranNo} (already ${existing.match_status})`);
      return new Response(
        JSON.stringify({ message: 'Success', status: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tranAmt = Number(body.TranAmt ?? 0);
    const drCr = (body.DrCr ?? '').toString().toLowerCase();
    const currency = (body.CurrencyCode ?? '').toString().toUpperCase();
    const narration = body.Narration ?? '';
    const { sender, receiver } = parseNarration(narration);

    let matchStatus: string = 'unmatched';
    let matchedPaymentId: string | null = null;
    let matchedOrderId: string | null = null;
    let matchNotes: string | null = null;

    // Skip non-credit
    if (drCr && drCr !== 'cr') {
      matchStatus = 'ignored_debit';
      matchNotes = `Debit transaction ignored (DrCr=${drCr})`;
    } else if (currency && currency !== 'USD') {
      matchStatus = 'ignored_debit';
      matchNotes = `Non-USD currency ignored (${currency})`;
    } else if (!sender) {
      matchStatus = 'failed_parse';
      matchNotes = 'Could not extract sender phone from Narration';
    } else {
      // Auto-match: find pending_online_payments with same amount + sender phone
      const senderL9 = last9(sender);
      const { data: candidates, error: matchErr } = await supabase
        .from('pending_online_payments')
        .select('id, sender_phone, expected_amount, receiver_phone, provider_id, package_id, status, created_at')
        .eq('status', 'pending')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      if (matchErr) {
        console.error('match query failed:', matchErr);
      }

      const exact = (candidates || []).find(c =>
        Number(c.expected_amount) === tranAmt &&
        last9(c.sender_phone) === senderL9
      );

      if (exact) {
        matchedPaymentId = exact.id;
        matchStatus = 'matched';
        matchNotes = `Auto-matched to pending payment ${exact.id}`;

        // Mark pending payment as matched
        await supabase
          .from('pending_online_payments')
          .update({ status: 'matched', matched_at: new Date().toISOString() })
          .eq('id', exact.id);

        // Trigger activate-package via internal call
        try {
          const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/activate-package`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              pendingPaymentId: exact.id,
              source: 'bank_push',
              tranNo,
            }),
          });
          const txt = await resp.text();
          console.log(`📦 activate-package called: ${resp.status} ${txt.slice(0, 200)}`);
          matchNotes += ` | activate-package: HTTP ${resp.status}`;
          if (!resp.ok) {
            matchStatus = 'matched_queue_failed';
            matchNotes += ` | queue failed: ${txt.slice(0, 160)}`;
          } else {
            try {
              const activation = JSON.parse(txt);
              matchedOrderId = activation?.orderId || null;
            } catch (_) { /* response text already logged */ }
          }
        } catch (e) {
          console.error('activate-package call failed:', e);
          matchStatus = 'matched_queue_failed';
          matchNotes += ` | activate-package error: ${(e as Error).message}`;
        }
      } else {
        matchStatus = 'unmatched';
        matchNotes = `No pending payment matched (sender=${senderL9}, amount=${tranAmt})`;
      }
    }

    const { error: insErr } = await supabase
      .from('bank_transactions')
      .insert({
        tran_no: tranNo,
        tran_date: body.TranDate?.toString() ?? null,
        tran_date_time: body.TranDateTime ? new Date(body.TranDateTime).toISOString() : null,
        acc_no: body.AccNo?.toString() ?? null,
        customer_name: body.CustomerName?.toString() ?? null,
        tran_amt: tranAmt,
        narration,
        dr_cr: drCr || null,
        uti: body.UTI?.toString() ?? null,
        currency_code: currency || null,
        rrp_no: body.RrpNo?.toString() ?? null,
        tran_desc: body.TranDesc?.toString() ?? null,
        tran_type: body.TranType?.toString() ?? null,
        user_id_field: body.UserId?.toString() ?? null,
        charge_amt: body.ChargeAmt != null ? Number(body.ChargeAmt) : null,
        raw_payload: body,
        parsed_sender_phone: sender,
        parsed_receiver_phone: receiver,
        match_status: matchStatus,
        matched_payment_id: matchedPaymentId,
        matched_order_id: matchedOrderId,
        match_notes: matchNotes,
        processed_at: new Date().toISOString(),
      });

    if (insErr) {
      console.error('bank tx insert failed:', insErr);
      return new Response(
        JSON.stringify({ message: 'Server error', status: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ bank tx ${tranNo} stored: ${matchStatus}`);
    return new Response(
      JSON.stringify({ message: 'Success', status: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('bank-push error:', e);
    return new Response(
      JSON.stringify({ message: 'Server error', status: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
