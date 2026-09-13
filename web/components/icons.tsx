import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </Icon>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5h9a2 2 0 0 1 2 2V19a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5Z" />
      <path d="M9 4.5V20" />
      <path d="M18.5 7.5 20 8v11.2a.8.8 0 0 1-1.1.75L16 18.8" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.75} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  );
}

export function NewChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
      <path d="M12 8v4M10 10h4" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 7h14" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M7 7l.8 11a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 17v5" />
      <path d="M8 11.5 7 8.5A2 2 0 0 1 9 6h6a2 2 0 0 1 2 2.5L16 11.5 18 14H6l2-2.5Z" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 7 6 5-6 5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 9 5 6 5-6" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8.5" r="2.5" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <circle cx="16" cy="9" r="2" />
      <path d="M15 18a4 4 0 0 1 4.5-3.9" />
    </Icon>
  );
}

export function HideIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="m4 20 16-16" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 10.5a5.5 5.5 0 1 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4l1.5 2H18.5A1.5 1.5 0 0 1 20 9.5v7A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z" />
    </Icon>
  );
}

export function MarketplaceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 8.5 8 5h8l3 3.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18Z" />
      <path d="M3 8.5h18" />
      <path d="M9.5 12.5h5" />
    </Icon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="3.5" width="6" height="10" rx="3" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 7h14M5 12h14M5 17h14" />
    </Icon>
  );
}

export function ComputerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M8 19.5h8M12 16v3.5" />
    </Icon>
  );
}

export function UsageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 16.5 9 11l3.5 3.5 7-8" />
      <path d="M4.5 19.5h15" />
    </Icon>
  );
}

export function UpdatesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 4.5v4.2h-4.2" />
    </Icon>
  );
}

export function SupportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="m4 8 8 6 8-6" />
    </Icon>
  );
}

export function ProviderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z" />
      <path d="M12 12 20 8M12 12v8.5M12 12 4 8" />
    </Icon>
  );
}

export function PlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 6h10M8 12h10M8 18h7" />
      <path d="M5 6h.01M5 12h.01M5 18h.01" />
    </Icon>
  );
}

export function DebugIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2M12 17v2M5 12h2M17 12h2M7 7l1.5 1.5M15.5 15.5 17 17M17 7l-1.5 1.5M8.5 15.5 7 17" />
    </Icon>
  );
}

export function AskIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1.4.9-1.4 1.7V14" />
      <path d="M12 17.2h.01" />
    </Icon>
  );
}

export function MultitaskIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="10" height="10" rx="1.5" />
      <path d="M10 15v1.5A1.5 1.5 0 0 0 11.5 18H18a1.5 1.5 0 0 0 1.5-1.5v-6.5A1.5 1.5 0 0 0 18 8.5H16" />
    </Icon>
  );
}

export function McpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 8h8v8H8Z" />
      <path d="M12 4.5v3.5M12 16v3.5M4.5 12H8M16 12h3.5" />
    </Icon>
  );
}
