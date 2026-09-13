"use client";

import type { Proposal } from "../../shared/agent-store.ts";
import { BotAvatar } from "./bot-avatar";
import { CheckIcon, CloseIcon, UsersIcon } from "./icons";
import type { ShellBot } from "../../shared/shell-store.ts";

export type ProposalDecision = {
  proposalId: string;
  proposalStatus: "confirmed" | "dismissed";
  action?: import("../../shared/shell-store.ts").ShellAction;
};

/**
 * One card per confirmation the bot asked for: a new teammate, a new group, a
 * profile edit, or a group fan-out. Nothing is written until Confirm.
 */
export function ProposalCard({
  proposal,
  bots,
  pending,
  onDecision,
}: {
  proposal: Proposal;
  bots: ShellBot[];
  pending: boolean;
  onDecision: (decision: ProposalDecision) => void;
}) {
  const nameOf = (id: string) => bots.find((bot) => bot.id === id)?.name ?? "a bot";
  const dismiss = () => onDecision({ proposalId: proposal.id, proposalStatus: "dismissed" });
  const confirm = (action: ProposalDecision["action"]) => {
    onDecision({ proposalId: proposal.id, proposalStatus: "confirmed", action });
  };

  if (proposal.kind === "createBot") {
    return (
      <Card title="New teammate" tone="accent">
        <p className="text-[15px] font-semibold">{proposal.name}</p>
        {proposal.title ? <p className="text-[13px] text-ink-muted">{proposal.title}</p> : null}
        {proposal.description ? (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-ink-muted">{proposal.description}</p>
        ) : (
          <p className="mt-2 text-[13px] text-ink-muted">No standing instructions yet.</p>
        )}
        {proposal.brief ? (
          <p className="mt-2 text-[12px] leading-5 text-ink-faint">First brief: {proposal.brief}</p>
        ) : null}
        <Actions
          confirmLabel="Add teammate"
          dismissLabel="Not now"
          onConfirm={() => confirm({
            type: "createBot",
            name: proposal.name,
            petname: proposal.petname,
            label: proposal.title,
            description: proposal.description,
            sectionId: proposal.sectionId,
          })}
          onDismiss={dismiss}
          pending={pending}
        />
      </Card>
    );
  }

  if (proposal.kind === "createGroup") {
    return (
      <Card title="New group chat" tone="accent">
        <p className="text-[15px] font-semibold">{proposal.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
          <UsersIcon className="size-3.5" />
          {proposal.memberIds.length} members
        </p>
        <ul className="mt-2 space-y-1">
          {proposal.memberIds.map((id) => (
            <li className="text-[13px] text-ink-muted" key={id}>{nameOf(id)}</li>
          ))}
        </ul>
        <Actions
          confirmLabel="Create group"
          dismissLabel="Not now"
          onConfirm={() => confirm({
            type: "createGroup",
            name: proposal.name,
            memberIds: proposal.memberIds,
          })}
          onDismiss={dismiss}
          pending={pending}
        />
      </Card>
    );
  }

  if (proposal.kind === "updateBotProfile") {
    const target = bots.find((bot) => bot.id === proposal.botId);
    return (
      <Card title={`Profile edit: ${target?.name ?? "bot"}`} tone="plain">
        <dl className="space-y-1.5 text-[13px]">
          <Row label="Name" before={target?.name ?? ""} after={proposal.patch.name} />
          <Row label="Title" before={target?.label ?? ""} after={proposal.patch.title} />
          <Row label="Description" before={target?.description ?? ""} after={proposal.patch.description} />
        </dl>
        <Actions
          confirmLabel="Apply profile"
          dismissLabel="Keep as is"
          onConfirm={() => confirm({
            type: "updateBot",
            botId: proposal.botId,
            patch: {
              name: proposal.patch.name,
              label: proposal.patch.title,
              description: proposal.patch.description,
              ...(proposal.patch.avatarShape ? { avatarShape: proposal.patch.avatarShape } : {}),
              ...(proposal.patch.avatarColor ? { avatarColor: proposal.patch.avatarColor } : {}),
            },
          })}
          onDismiss={dismiss}
          pending={pending}
        />
      </Card>
    );
  }

  const group = proposal.groupId ? bots.find((bot) => bot.id === proposal.groupId) : null;
  return (
    <Card title={group ? `Post to ${group.name}` : "Send to several bots"} tone="warning">
      <p className="whitespace-pre-wrap text-[13px] leading-5 text-ink">{proposal.message}</p>
      <p className="mt-2 text-[12px] text-ink-muted">
        {proposal.targetIds.length} bots will each run on this: {proposal.targetIds.map(nameOf).join(", ")}
      </p>
      <Actions
        confirmLabel={`Send to ${proposal.targetIds.length}`}
        dismissLabel="Cancel"
        onConfirm={() => confirm({
          type: "sendToBot",
          botId: proposal.groupId ?? proposal.targetIds[0],
          message: proposal.message,
          sourceBotId: proposal.sourceBotId,
        })}
        onDismiss={dismiss}
        pending={pending}
      />
    </Card>
  );
}

function Card({
  children,
  title,
  tone,
}: {
  children: React.ReactNode;
  title: string;
  tone: "accent" | "warning" | "plain";
}) {
  const ring = tone === "warning"
    ? "border-warning/40 bg-warning-soft"
    : "border-border bg-surface";
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${ring}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${tone === "warning" ? "text-warning" : "text-ink-faint"}`}>
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Row({ before, after, label }: { before: string; after: string }) {
  const changed = before !== after;
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-ink-muted">
        {changed ? (
          <>
            {before ? <span className="line-through opacity-60">{before}</span> : null}
            {before ? " " : null}
            <span className="font-medium text-ink">{after || "(empty)"}</span>
          </>
        ) : (
          <span>{after || "(empty)"}</span>
        )}
      </dd>
    </div>
  );
}

function Actions({
  confirmLabel,
  dismissLabel,
  onConfirm,
  onDismiss,
  pending,
}: {
  confirmLabel: string;
  dismissLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2">
      <button
        className="btn btn-primary min-h-9 px-3 text-sm"
        disabled={pending}
        onClick={onConfirm}
        type="button"
      >
        <CheckIcon className="size-3.5" />
        {confirmLabel}
      </button>
      <button
        className="btn btn-secondary min-h-9 px-3 text-sm"
        disabled={pending}
        onClick={onDismiss}
        type="button"
      >
        <CloseIcon className="size-3.5" />
        {dismissLabel}
      </button>
    </div>
  );
}

/** First-turn onboarding prompt for a bot that has no profile yet. */
export function OnboardingCard({
  petname,
  onFillForm,
  onDismiss,
}: {
  petname: string;
  onFillForm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card title="New bot" tone="accent">
      <p className="text-[15px] leading-6 text-ink">
        {petname} has no job yet. What should I own? Give me a job title, standing rules, and anything I must never
        do without asking.
      </p>
      <p className="mt-2 text-[12px] leading-5 text-ink-muted">
        Answer here and I will propose a profile for you to confirm, or fill the form.
      </p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onFillForm} type="button">
          Fill the form
        </button>
        <button className="btn btn-secondary min-h-9 px-3 text-sm" onClick={onDismiss} type="button">
          Skip
        </button>
      </div>
    </Card>
  );
}
