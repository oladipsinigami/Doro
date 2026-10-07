"use client";

import React from "react";
import { MASCOTS, type Mascot } from "@/lib/mascots";

interface MascotSelectorProps {
  selectedMascotId: string;
  onSelect: (mascot: Mascot) => void;
}

export default function MascotSelector({
  selectedMascotId,
  onSelect,
}: MascotSelectorProps) {
  return (
    <div className="w-full">
      <div className="text-sm font-medium text-doro-inktext mb-2">Courier</div>
      <div className="grid grid-cols-4 gap-2">
        {MASCOTS.map((mascot) => {
          const isSelected = mascot.id === selectedMascotId;

          return (
            <button
              key={mascot.id}
              type="button"
              onClick={() => onSelect(mascot)}
              aria-pressed={isSelected}
              className={`rounded-xl bg-[#fbf6ea] p-1 text-center transition ${
                isSelected
                  ? "ring-2 ring-[#C6A15A] shadow-[0_0_18px_rgba(198,161,90,0.45)]"
                  : "ring-1 ring-[#e4d3b4] hover:ring-[#C6A15A]"
              }`}
            >
              <img
                src={mascot.image}
                alt=""
                className="aspect-square w-full rounded-lg object-cover object-[center_32%]"
              />
              <div className="px-1 py-1.5 text-[11px] leading-tight text-doro-inktext">
                {mascot.name.replace(" Angel", "")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
