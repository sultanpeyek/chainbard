import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { ENTER_BEZIER } from "./brand";

// Fade + slight rise, brand entrance easing. `delay`/`duration` are in frames
// relative to the caller's Sequence (useCurrentFrame() is local in a Sequence).
export const useEnter = (delay = 0, duration = 24) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...ENTER_BEZIER),
  });
};

// Symmetric fade: rises in, holds, falls out — for captions that come and go.
export const useFadeInOut = (
  inAt: number,
  inDur: number,
  outAt: number,
  outDur: number,
) => {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [inAt, inAt + inDur, outAt, outAt + outDur],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...ENTER_BEZIER),
    },
  );
};

// Standard narrative / lower-third caption rendered with an entrance.
export const Caption: React.FC<{
  children: React.ReactNode;
  delay?: number;
  fontFamily: string;
  color: string;
  size: number;
  weight?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, fontFamily, color, size, weight = 400, style }) => {
  const p = useEnter(delay);
  return (
    <div
      style={{
        fontFamily,
        color,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.15,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [14, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
