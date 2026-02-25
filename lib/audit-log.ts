import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuditOutcome = 'success' | 'failure';

interface AuditEventInput {
  req?: NextRequest;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resource: string;
  resourceId?: string | number | null;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
}

function getRequestId(req?: NextRequest) {
  return req?.headers.get('x-request-id') ?? crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function shouldPersistAuditToDb() {
  // Persist by default. Set AUDIT_LOG_TO_DB=0 only when explicitly disabling DB writes.
  return process.env.AUDIT_LOG_TO_DB !== '0';
}

let auditDbClient: SupabaseClient<any> | null = null;

function getAuditDbClient(): SupabaseClient<any> {
  if (auditDbClient) return auditDbClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // Prefer service role for server-side audit writes so inserts are not blocked by RLS.
  if (url && serviceRoleKey) {
    auditDbClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return auditDbClient;
  }

  // Fallback to shared client (may be anon key in some environments).
  auditDbClient = supabase;
  return auditDbClient;
}

function formatAuditEvent(input: AuditEventInput) {
  return {
    requestId: getRequestId(input.req),
    timestamp: nowIso(),
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome ?? 'success',
    metadata: input.metadata ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  };
}

export async function writeAuditEvent(input: AuditEventInput) {
  const event = formatAuditEvent(input);

  try {
    console.info(
      JSON.stringify({
        level: 'info',
        type: 'audit_event',
        persistToDb: shouldPersistAuditToDb(),
        ...event,
      })
    );

    if (!shouldPersistAuditToDb()) {
      return;
    }

    const { error } = await getAuditDbClient().from('audit_logs').insert([
      {
        request_id: event.requestId,
        actor_id: event.actorId,
        actor_email: event.actorEmail,
        actor_role: event.actorRole,
        action: event.action,
        resource: event.resource,
        resource_id: event.resourceId ? String(event.resourceId) : null,
        outcome: event.outcome,
        metadata: event.metadata,
        before_state: event.before,
        after_state: event.after,
        created_at: event.timestamp,
      },
    ]);

    if (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          type: 'audit_event_persist_failed',
          requestId: event.requestId,
          action: event.action,
          resource: event.resource,
          code: (error as any).code ?? null,
          details: (error as any).details ?? null,
          hint: (error as any).hint ?? null,
          message: error.message,
        })
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: 'error',
        type: 'audit_event_failed',
        requestId: event.requestId,
        message,
      })
    );
  }
}
