'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2, ShieldCheck, ArrowRight, Bell } from 'lucide-react';

function AlertAckContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const alertId = searchParams.get('alert_id');
  const userId = searchParams.get('user_id');
  const expStr = searchParams.get('exp');
  const sig = searchParams.get('sig');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertDetails, setAlertDetails] = useState<any>(null);

  useEffect(() => {
    async function acknowledge() {
      if (!alertId || !userId || !expStr || !sig) {
        setError('Missing required authentication parameters in the acknowledgment link.');
        setLoading(false);
        return;
      }

      const exp = parseInt(expStr, 10);
      const rawApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const apiBase = rawApi.replace(/\/api\/v1\/?$/, '');

      try {
        const res = await fetch(`${apiBase}/api/v1/alerts/ack-by-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert_id: alertId,
            user_id: userId,
            exp,
            sig,
            notes: 'Acknowledged via official email 1-click link'
          })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          setSuccess(true);
          setAlertDetails(data.alert);
        } else {
          setError(data.detail || 'Unable to verify acknowledgment signature.');
        }
      } catch (err: any) {
        setError(err.message || 'Network error verifying acknowledgment.');
      } finally {
        setLoading(false);
      }
    }

    acknowledge();
  }, [alertId, userId, expStr, sig]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white border border-[#E8E2D8] rounded-3xl p-8 shadow-xl text-center space-y-6 text-[#1C1917]">
        {loading ? (
          <div className="py-12 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-[#C25E26] mx-auto" />
            <h2 className="text-lg font-serif font-bold text-[#1C1917]">
              Verifying Cryptographic Signature...
            </h2>
            <p className="text-xs text-stone-500">
              Validating HMAC-SHA256 token and recording append-only audit trail.
            </p>
          </div>
        ) : success ? (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-2xl font-serif font-bold text-[#1C1917]">
                Alert Acknowledged
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Your one-click acknowledgment has been cryptographically recorded.
              </p>
            </div>

            {alertDetails && (
              <div className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] text-left space-y-2 text-xs">
                <div className="flex justify-between text-stone-500">
                  <span>Status:</span>
                  <span className="font-semibold text-emerald-700 uppercase">Acknowledged</span>
                </div>
                <div className="text-stone-800 font-medium">
                  {alertDetails.message || 'SLA Notice'}
                </div>
              </div>
            )}

            <div className="p-3.5 bg-[#FBF0E4]/70 border border-[#F0D5BE] rounded-xl text-[11px] text-[#C25E26]">
              Automatic escalation has been paused. A signed entry has been appended to the immutable audit log.
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/alerts"
                className="w-full py-2.5 px-4 rounded-full text-xs font-medium bg-[#C25E26] text-white hover:bg-[#A84A19] transition shadow-2xs inline-flex items-center justify-center gap-1.5"
              >
                <Bell className="w-4 h-4" /> Go to Alerts Inbox
              </Link>
              <Link
                href="/dashboard"
                className="w-full py-2.5 px-4 rounded-full text-xs font-medium text-stone-700 border border-[#E8E2D8] bg-white hover:bg-[#FAF7F2] transition"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto shadow-sm">
              <XCircle className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-xl font-serif font-bold text-[#1C1917]">
                Verification Failed
              </h2>
              <p className="text-xs text-rose-600 mt-1">
                {error || 'This link may have expired or is malformed.'}
              </p>
            </div>

            <p className="text-xs text-stone-500">
              For security, one-click email acknowledge links expire after 7 days. You can sign in to manually review and acknowledge alerts.
            </p>

            <Link
              href="/login"
              className="w-full py-2.5 px-4 rounded-full text-xs font-medium bg-[#C25E26] hover:bg-[#A84A19] text-white transition shadow-2xs inline-flex items-center justify-center gap-1.5"
            >
              Sign In to AICTE Portal <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlertAckPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center">Validating acknowledgment link...</div>}>
      <AlertAckContent />
    </Suspense>
  );
}
