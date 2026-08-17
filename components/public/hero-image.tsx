"use client";

import Image from "next/image";
import { useState } from "react";

const primaryHero = "/images/vult-fantasy-real-players-hero.jpeg";
const fallbackHero = "/images/vult-fantasy-real-players-hero.webp";

export function HeroImage() {
  const [source, setSource] = useState(primaryHero);

  return (
    <Image
      src={source}
      alt="Premier League players in a floodlit stadium"
      fill
      priority
      sizes="100vw"
      className="object-cover object-[66%_center]"
      onError={() => {
        if (source !== fallbackHero) setSource(fallbackHero);
      }}
    />
  );
}
