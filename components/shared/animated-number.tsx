'use client';

import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number | null | undefined;
  prefix?: string;
  suffix?: string;
  duration?: number;
  locale?: string;
  options?: Intl.NumberFormatOptions;
}

export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  duration = 600,
  locale = 'en-US',
  options,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState<number>(value ?? 0);
  const previousRef = useRef<number>(value ?? 0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const target = value ?? 0;
    const startValue = previousRef.current;
    if (target === startValue) {
      setDisplayValue(target);
      return;
    }

    previousRef.current = target;
    startTimeRef.current = null;

    let frameId: number;

    const step = (timestamp: number) => {
      if (startTimeRef.current == null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      const nextValue = startValue + (target - startValue) * eased;
      setDisplayValue(nextValue);
      if (t < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [value, duration]);

  const formatter = new Intl.NumberFormat(locale, options);
  const formatted = formatter.format(displayValue || 0);

  const showPrefix = options?.style === 'currency' ? '' : prefix;

  return (
    <span>
      {showPrefix}
      {formatted}
      {suffix}
    </span>
  );
}

