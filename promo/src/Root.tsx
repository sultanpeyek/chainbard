import "./index.css";
import { Composition } from "remotion";
import { ChainBardFull } from "./Full";
import { ChainBardRecut } from "./Recut";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ChainBardRecut"
        component={ChainBardRecut}
        durationInFrames={1055}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ChainBardFull"
        component={ChainBardFull}
        durationInFrames={1655}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
