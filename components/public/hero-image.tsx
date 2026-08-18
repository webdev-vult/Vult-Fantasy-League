"use client";

import Image from "next/image";
import { useState } from "react";

const primaryHero = "/images/vult-fantasy-real-players-hero.jpeg";
const fallbackHero = "/images/vult-fantasy-real-players-hero.webp";

export function HeroImage() {
  const [source, setSource] = useState(primaryHero);

  return (
    <div className="absolute inset-x-0 top-96 h-[430px] sm:inset-0 sm:h-auto">
      <Image
        src={source}
        alt="Premier League players in a floodlit stadium"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[86%_center] sm:object-[66%_center]"
        onError={() => {
          if (source !== fallbackHero) setSource(fallbackHero);
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#080a20_0%,rgba(8,10,32,0.08)_24%,rgba(8,10,32,0.12)_74%,#080a20_100%)] sm:hidden" />
    </div>
  );
}
