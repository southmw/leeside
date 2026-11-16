import { describe, expect, it } from "vitest";
import { SectionTimer } from "../../src/debug/sectionTimer";

/** A clock the test moves by hand. */
function createClock() {
  let time = 0;
  return {
    now: () => time,
    advance(ms: number) {
      time += ms;
    },
  };
}

function setup(capacity?: number) {
  const clock = createClock();
  const timer = new SectionTimer(["sim", "render"] as const, clock.now, capacity);
  const run = (name: "sim" | "render", ms: number): void => {
    timer.begin(name);
    clock.advance(ms);
    timer.end(name);
  };
  return { clock, timer, run };
}

describe("SectionTimer", () => {
  it("reports zeros before any frame has finished", () => {
    const { timer } = setup();
    expect(timer.snapshot()).toEqual({
      sim: { ms: 0, avgMs: 0, maxMs: 0 },
      render: { ms: 0, avgMs: 0, maxMs: 0 },
    });
  });

  it("records the time between begin and end", () => {
    const { timer, run } = setup();
    run("sim", 2);
    run("render", 5);
    timer.endFrame();
    const { sim, render } = timer.snapshot();
    expect(sim.ms).toBe(2);
    expect(render.ms).toBe(5);
  });

  it("sums several runs of a section within one frame", () => {
    const { timer, run } = setup();
    run("sim", 1);
    run("sim", 1.5);
    run("sim", 0.5);
    timer.endFrame();
    expect(timer.snapshot().sim.ms).toBe(3);
  });

  it("does not count time spent outside sections", () => {
    const { clock, timer, run } = setup();
    run("sim", 1);
    clock.advance(10);
    run("render", 2);
    timer.endFrame();
    expect(timer.snapshot()).toMatchObject({ sim: { ms: 1 }, render: { ms: 2 } });
  });

  it("averages per frame and keeps the maximum", () => {
    const { timer, run } = setup();
    for (const ms of [2, 4, 9]) {
      run("render", ms);
      timer.endFrame();
    }
    expect(timer.snapshot().render).toEqual({ ms: 9, avgMs: 5, maxMs: 9 });
  });

  it("counts a frame in which a section did not run as zero", () => {
    const { timer, run } = setup();
    run("sim", 4);
    timer.endFrame();
    timer.endFrame();
    expect(timer.snapshot().sim).toEqual({ ms: 0, avgMs: 2, maxMs: 4 });
  });

  it("drops the oldest frames beyond its capacity", () => {
    const { timer, run } = setup(2);
    for (const ms of [100, 1, 3]) {
      run("sim", ms);
      timer.endFrame();
    }
    expect(timer.snapshot().sim).toEqual({ ms: 3, avgMs: 2, maxMs: 3 });
  });

  it("ignores an end without a begin", () => {
    const { clock, timer } = setup();
    clock.advance(5);
    timer.end("sim");
    timer.endFrame();
    expect(timer.snapshot().sim.ms).toBe(0);
  });

  it("clears everything on reset", () => {
    const { timer, run } = setup();
    run("sim", 4);
    timer.endFrame();
    timer.reset();
    expect(timer.snapshot().sim).toEqual({ ms: 0, avgMs: 0, maxMs: 0 });
  });
});
