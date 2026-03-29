import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export function RunButton({
  onClick,
  disabled,
  label = t("agentAction.runNow"),
  size = "sm",
  iconOnly = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default" | "icon-sm";
  iconOnly?: boolean;
}) {
  return (
    <Button variant="outline" size={size} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <Play className="h-3.5 w-3.5" />
      {!iconOnly ? <span className="hidden sm:inline">{label}</span> : null}
    </Button>
  );
}

export function PauseResumeButton({
  isPaused,
  onPause,
  onResume,
  disabled,
  size = "sm",
  iconOnly = false,
}: {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  disabled?: boolean;
  size?: "sm" | "default" | "icon-sm";
  iconOnly?: boolean;
}) {
  if (isPaused) {
    const label = t("agentAction.resume");
    return (
      <Button
        variant="outline"
        size={size}
        onClick={onResume}
        disabled={disabled}
        aria-label={label}
        title={label}
      >
        <Play className="h-3.5 w-3.5" />
        {!iconOnly ? <span className="hidden sm:inline">{label}</span> : null}
      </Button>
    );
  }

  const label = t("agentAction.pause");
  return (
    <Button
      variant="outline"
      size={size}
      onClick={onPause}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Pause className="h-3.5 w-3.5" />
      {!iconOnly ? <span className="hidden sm:inline">{label}</span> : null}
    </Button>
  );
}
