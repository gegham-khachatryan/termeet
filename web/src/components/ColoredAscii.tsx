import { Fragment } from "react"
import type { AsciiColoredLines } from "../types"

export function ColoredAscii({ lines }: { lines: AsciiColoredLines }) {
  return (
    <pre className="video-feed ascii-colored active">
      {lines.map((runs, yi) => (
        <Fragment key={yi}>
          {runs.map((run, ri) => (
            <span
              key={ri}
              style={{
                color: `rgb(${run.rgb[0]}, ${run.rgb[1]}, ${run.rgb[2]})`,
              }}
            >
              {run.text}
            </span>
          ))}
          {yi < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </pre>
  )
}
