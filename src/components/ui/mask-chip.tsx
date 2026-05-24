"use client";

interface MaskChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export function MaskChip({ label, active, onClick }: MaskChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors",
        active
          ? "bg-[#D20A2E] border-[#D20A2E] text-white"
          : "bg-white border-[#E5D3CF] text-[#8A5B60] hover:border-[#D20A2E] hover:text-[#D20A2E]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
