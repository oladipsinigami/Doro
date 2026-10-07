"use client";

import React from "react";

interface MascotIllustrationProps {
  id: string;
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function MascotIllustration({
  id,
  size = 140,
  className = "",
  animate = false,
}: MascotIllustrationProps) {
  const animClass = animate ? "animate-pulse-slow hover:scale-105 transition-transform duration-300" : "";

  if (id === "chog-cyber") {
    // Chog Cyber: High-tech cybernetic Monad pup with cyan visor and energy collar
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${animClass} ${className}`}
      >
        <defs>
          <linearGradient id="cyber-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E1B4B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <linearGradient id="neon-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#20E1FF" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        {/* Ears */}
        <path d="M55 45 L75 85 L45 80 Z" fill="#2E1065" stroke="#20E1FF" strokeWidth="2.5" />
        <path d="M145 45 L125 85 L155 80 Z" fill="#2E1065" stroke="#20E1FF" strokeWidth="2.5" />
        <path d="M58 55 L70 80 L52 75 Z" fill="#38BDF8" opacity="0.6" />
        <path d="M142 55 L130 80 L148 75 Z" fill="#38BDF8" opacity="0.6" />

        {/* Head */}
        <ellipse cx="100" cy="95" rx="55" ry="48" fill="url(#cyber-body)" stroke="#20E1FF" strokeWidth="3" />

        {/* Cyber Visor / Goggles */}
        <rect x="58" y="75" width="84" height="26" rx="13" fill="#0369A1" stroke="#20E1FF" strokeWidth="2.5" />
        <rect x="63" y="79" width="74" height="18" rx="9" fill="url(#neon-cyan)" opacity="0.85" />
        {/* Visor Glare & Tech Scan Line */}
        <line x1="68" y1="88" x2="132" y2="88" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="6 3" />
        <circle cx="82" cy="88" r="3" fill="#FFFFFF" />
        <circle cx="118" cy="88" r="3" fill="#FFFFFF" />

        {/* Snout & Nose */}
        <ellipse cx="100" cy="115" rx="18" ry="12" fill="#1E293B" />
        <path d="M96 112 Q100 110 104 112 L100 117 Z" fill="#20E1FF" />
        <path d="M97 119 Q100 123 103 119" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />

        {/* Cyber Antenna */}
        <line x1="100" y1="47" x2="100" y2="30" stroke="#20E1FF" strokeWidth="3" />
        <circle cx="100" cy="27" r="5" fill="#20E1FF" />
        <circle cx="100" cy="27" r="8" stroke="#20E1FF" strokeWidth="1.5" opacity="0.6" />

        {/* Body & Cyber Suit */}
        <path d="M70 140 Q100 135 130 140 L138 180 Q100 188 62 180 Z" fill="url(#cyber-body)" stroke="#334155" strokeWidth="2" />
        
        {/* Energy Core / MON Crest */}
        <circle cx="100" cy="155" r="14" fill="#0C4A6E" stroke="#20E1FF" strokeWidth="2" />
        <path d="M95 155 L100 147 L105 155 L100 163 Z" fill="#20E1FF" />

        {/* Gift Delivery Pod */}
        <rect x="84" y="166" width="32" height="22" rx="4" fill="#0F172A" stroke="#20E1FF" strokeWidth="2" />
        <line x1="100" y1="166" x2="100" y2="188" stroke="#F43F5E" strokeWidth="2" />
        <line x1="84" y1="177" x2="116" y2="177" stroke="#F43F5E" strokeWidth="2" />
        <circle cx="100" cy="166" r="3" fill="#F43F5E" />
      </svg>
    );
  }

  if (id === "barista-bear") {
    // Barista Bear: Warm plush bear with cozy knitted scarf and steaming gift cup
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${animClass} ${className}`}
      >
        <defs>
          <linearGradient id="bear-fur" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#92400E" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
        </defs>

        {/* Bear Ears */}
        <circle cx="58" cy="60" r="22" fill="#78350F" stroke="#B45309" strokeWidth="3" />
        <circle cx="58" cy="60" r="12" fill="#D97706" />
        <circle cx="142" cy="60" r="22" fill="#78350F" stroke="#B45309" strokeWidth="3" />
        <circle cx="142" cy="60" r="12" fill="#D97706" />

        {/* Head */}
        <circle cx="100" cy="95" r="48" fill="url(#bear-fur)" stroke="#B45309" strokeWidth="3" />

        {/* Snout */}
        <ellipse cx="100" cy="108" rx="20" ry="15" fill="#FDE68A" />
        <ellipse cx="100" cy="102" rx="7" ry="5" fill="#451A03" />
        <path d="M100 107 L100 114 M95 114 Q100 118 105 114" stroke="#451A03" strokeWidth="2.5" strokeLinecap="round" />

        {/* Warm Eyes */}
        <circle cx="82" cy="88" r="6" fill="#1C1917" />
        <circle cx="80" cy="86" r="2" fill="#FFFFFF" />
        <circle cx="118" cy="88" r="6" fill="#1C1917" />
        <circle cx="116" cy="86" r="2" fill="#FFFFFF" />

        {/* Cozy Knitted Scarf */}
        <path
          d="M60 130 C60 120 140 120 140 130 C140 142 60 142 60 130 Z"
          fill="#D97706"
          stroke="#F59E0B"
          strokeWidth="3"
        />
        <path d="M115 135 L125 175 L140 175 L130 135 Z" fill="#D97706" stroke="#F59E0B" strokeWidth="2" />
        {/* Scarf Fringes */}
        <line x1="126" y1="175" x2="126" y2="182" stroke="#FDE68A" strokeWidth="2" />
        <line x1="131" y1="175" x2="131" y2="182" stroke="#FDE68A" strokeWidth="2" />
        <line x1="136" y1="175" x2="136" y2="182" stroke="#FDE68A" strokeWidth="2" />

        {/* Cozy Coffee Cup Gift */}
        <rect x="85" y="148" width="30" height="28" rx="6" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="2.5" />
        <path d="M115 154 Q125 154 125 162 Q125 170 115 170" stroke="#F59E0B" strokeWidth="2.5" fill="none" />
        {/* Heart Latte Art */}
        <path
          d="M100 162 C97 158 92 161 95 165 L100 169 L105 165 C108 161 103 158 100 162 Z"
          fill="#D97706"
        />
        {/* Steam */}
        <path d="M93 144 Q91 138 95 134" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M100 143 Q102 137 99 132" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M107 144 Q105 138 108 134" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === "star-bunny") {
    // Star Bunny: Kawaii cosmic rabbit with star wand and celestial sparkles
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${animClass} ${className}`}
      >
        <defs>
          <linearGradient id="bunny-fur" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F6D5E2" />
            <stop offset="100%" stopColor="#E7A8C0" />
          </linearGradient>
        </defs>

        {/* Long Bunny Ears */}
        <ellipse cx="75" cy="48" rx="14" ry="40" fill="url(#bunny-fur)" stroke="#F472B6" strokeWidth="2.5" transform="rotate(-10 75 48)" />
        <ellipse cx="75" cy="50" rx="7" ry="26" fill="#F472B6" opacity="0.6" transform="rotate(-10 75 50)" />
        <ellipse cx="125" cy="48" rx="14" ry="40" fill="url(#bunny-fur)" stroke="#F472B6" strokeWidth="2.5" transform="rotate(10 125 48)" />
        <ellipse cx="125" cy="50" rx="7" ry="26" fill="#F472B6" opacity="0.6" transform="rotate(10 125 50)" />

        {/* Head */}
        <ellipse cx="100" cy="105" rx="46" ry="40" fill="url(#bunny-fur)" stroke="#F472B6" strokeWidth="3" />

        {/* Rosy Cheeks */}
        <circle cx="68" cy="114" r="9" fill="#FDA4AF" opacity="0.7" />
        <circle cx="132" cy="114" r="9" fill="#FDA4AF" opacity="0.7" />

        {/* Sweet Big Eyes */}
        <ellipse cx="82" cy="102" rx="6" ry="8" fill="#831843" />
        <circle cx="80" cy="99" r="2.5" fill="#FFFFFF" />
        <circle cx="84" cy="104" r="1.5" fill="#FFFFFF" />
        <ellipse cx="118" cy="102" rx="6" ry="8" fill="#831843" />
        <circle cx="116" cy="99" r="2.5" fill="#FFFFFF" />
        <circle cx="120" cy="104" r="1.5" fill="#FFFFFF" />

        {/* Bunny Nose & Mouth */}
        <polygon points="100,111 97,108 103,108" fill="#EC4899" />
        <path d="M96 114 Q100 117 104 114" stroke="#BE185D" strokeWidth="2" strokeLinecap="round" />

        {/* Celestial Cape */}
        <path d="M68 140 Q100 135 132 140 L142 182 Q100 190 58 182 Z" fill="#4A044E" stroke="#EC4899" strokeWidth="2" />
        {/* Stars on cape */}
        <circle cx="85" cy="160" r="2" fill="#FDF2F8" />
        <circle cx="115" cy="165" r="2.5" fill="#FDE047" />
        <circle cx="98" cy="172" r="2" fill="#FDF2F8" />

        {/* Star Wand */}
        <line x1="135" y1="155" x2="155" y2="105" stroke="#FDE047" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M155 105 L158 97 L166 97 L160 92 L162 84 L155 89 L148 84 L150 92 L144 97 L152 97 Z"
          fill="#FDE047"
          stroke="#EAB308"
          strokeWidth="1.5"
        />

        {/* Glowing Gift Box in Arms */}
        <rect x="84" y="146" width="32" height="28" rx="5" fill="#EC4899" stroke="#FDF2F8" strokeWidth="2" />
        <line x1="100" y1="146" x2="100" y2="174" stroke="#FDE047" strokeWidth="3" />
        <line x1="84" y1="160" x2="116" y2="160" stroke="#FDE047" strokeWidth="3" />
        <circle cx="100" cy="146" r="4" fill="#FDE047" />
      </svg>
    );
  }

  // Default: Doro Angel (Plush Celestial anime muse with white wings, halo, Monad haori)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animClass} ${className}`}
    >
      <defs>
        <linearGradient id="angel-hair" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
        <linearGradient id="monad-haori" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E1346" />
          <stop offset="100%" stopColor="#0B061F" />
        </linearGradient>
        <linearGradient id="gold-halo" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#FEF08A" />
        </linearGradient>
      </defs>

      {/* Floating Golden Halo */}
      <ellipse cx="100" cy="28" rx="36" ry="10" stroke="url(#gold-halo)" strokeWidth="4" fill="none" />
      <ellipse cx="100" cy="28" rx="36" ry="10" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="12 18" fill="none" opacity="0.8" />

      {/* Feathered Angel Wings */}
      <g opacity="0.95">
        {/* Left Wing */}
        <path
          d="M60 85 C30 65 15 85 10 115 C25 125 45 110 58 100 Z"
          fill="#E4D8C4"
          stroke="#5C564E"
          strokeWidth="2.5"
        />
        <path d="M52 95 C35 85 24 100 20 120 C32 125 45 115 52 105 Z" fill="#D4C6B0" />
        {/* Right Wing */}
        <path
          d="M140 85 C170 65 185 85 190 115 C175 125 155 110 142 100 Z"
          fill="#E4D8C4"
          stroke="#5C564E"
          strokeWidth="2.5"
        />
        <path d="M148 95 C165 85 176 100 180 120 C168 125 155 115 148 105 Z" fill="#D4C6B0" />
      </g>

      {/* Spiky Anime Hair (Back) */}
      <path d="M55 70 L40 45 L70 52 L80 32 L100 48 L120 32 L130 52 L160 45 L145 70 Z" fill="url(#angel-hair)" />

      {/* Plush Face */}
      <circle cx="100" cy="85" r="44" fill="#FFEDD5" stroke="#FB923C" strokeWidth="2.5" />

      {/* Spiky Anime Bangs (Front) */}
      <path d="M60 65 Q75 80 85 68 Q95 85 105 68 Q115 85 125 68 Q135 80 140 65 L142 55 L58 55 Z" fill="url(#angel-hair)" />

      {/* Cheerful Anime Eyes */}
      <ellipse cx="80" cy="85" rx="7" ry="10" fill="#312E81" />
      <circle cx="78" cy="81" r="3" fill="#FFFFFF" />
      <circle cx="82" cy="87" r="1.5" fill="#FFFFFF" />
      <ellipse cx="120" cy="85" rx="7" ry="10" fill="#312E81" />
      <circle cx="118" cy="81" r="3" fill="#FFFFFF" />
      <circle cx="122" cy="87" r="1.5" fill="#FFFFFF" />

      {/* Cute Smile & Blush */}
      <path d="M94 96 Q100 102 106 96" stroke="#9A3412" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="68" cy="94" rx="7" ry="4" fill="#F87171" opacity="0.6" />
      <ellipse cx="132" cy="94" rx="7" ry="4" fill="#F87171" opacity="0.6" />

      {/* Monad Celestial Robe / Haori */}
      <path
        d="M62 125 Q100 120 138 125 L150 185 Q100 195 50 185 Z"
        fill="url(#monad-haori)"
        stroke="#836EF9"
        strokeWidth="3"
      />
      {/* Robe Collar / Trim */}
      <path d="M80 125 L100 155 L120 125" stroke="#C4B5FD" strokeWidth="3" fill="none" />
      <line x1="100" y1="155" x2="100" y2="188" stroke="#836EF9" strokeWidth="2.5" />

      {/* Glowing Purple Monad Gift Box in Hands */}
      <rect x="80" y="145" width="40" height="34" rx="6" fill="#836EF9" stroke="#E0E7FF" strokeWidth="2.5" />
      {/* Gift Ribbon */}
      <line x1="100" y1="145" x2="100" y2="179" stroke="#FDE047" strokeWidth="4" />
      <line x1="80" y1="162" x2="120" y2="162" stroke="#FDE047" strokeWidth="4" />
      {/* Ribbon Bow */}
      <ellipse cx="94" cy="144" rx="5" ry="3" fill="#FDE047" />
      <ellipse cx="106" cy="144" rx="5" ry="3" fill="#FDE047" />
      <circle cx="100" cy="145" r="3" fill="#FACC15" />
    </svg>
  );
}
