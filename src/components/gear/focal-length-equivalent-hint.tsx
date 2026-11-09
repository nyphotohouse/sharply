"use client";

import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { buildFocalLengthEquivalentTooltip } from "~/lib/mapping/focal-length-map";

type FocalLengthEquivalentHintProps = {
  equivalent: string;
  formatName: string;
};

/**
 * Renders "(19mm equiv. ⓘ)" with a tooltip explaining full-frame FOV equivalence.
 */
export function FocalLengthEquivalentHint({
  equivalent,
  formatName,
}: FocalLengthEquivalentHintProps) {
  const tooltip = buildFocalLengthEquivalentTooltip({
    formatName,
    equivalent,
  });

  return (
    <span className="text-muted-foreground inline-flex items-center">
      ({equivalent} equiv.&nbsp;
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={tooltip}
            className="focus-visible:ring-ring inline-flex shrink-0 rounded-sm outline-none focus-visible:ring-2"
          >
            <InfoIcon className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-pretty">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      )
    </span>
  );
}
