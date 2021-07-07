const searchParams = new URLSearchParams(window.location.search)
const project = searchParams.get('project')

const $ = (id: string) => document.getElementById(id)
const video = $('video') as HTMLVideoElement
const canvas = $('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

video.src = `${project}.mp4`

export {}

const config = (await import(/* @vite-ignore */ `${project}.config.js`))
  .default as {
  offset: number
  slice: 0
  title: string[]
}

const data = await fetch(`${project}.log`)
  .then((r) => r.text())
  .then((r) =>
    r
      .split('\n')
      .filter((l) => l.length)
      .map(
        (l) =>
          JSON.parse(l) as [
            time: number,
            action: string,
            pathJoined: string,
            ...extra: string[]
          ],
      ),
  )

type Row = {
  depth: number
  text: string
  type: 'test' | 'group'
  begin?: number
  testNum?: number
  end?: number
  result?: 'passed' | 'failed' | 'pending'
}

const rows: Row[] = []
let lastPath: string[] = []
let minTime = 0
let maxTime = 0
let numTests = 0

for (const event of data) {
  const [time, action, pathJoined, ...extra] = event
  maxTime = time
  if (action === 'before') {
    if (!minTime) {
      minTime = time
    }

    const path = pathJoined.split(' :=> ').slice(config.slice)

    // Find number of common path segments between last and new path
    let common = 0
    for (let i = 0; i < path.length; i++) {
      if (path[i] === lastPath[i]) {
        common++
      } else {
        break
      }
    }

    for (let i = common; i < path.length - 1; i++) {
      rows.push({
        type: 'group',
        text: path[i],
        depth: i,
      })
    }

    rows.push({
      type: 'test',
      text: path[path.length - 1],
      depth: path.length - 1,
      begin: time,
      testNum: ++numTests,
    })

    // Add new path segments
    lastPath = path
  } else if (action === 'after') {
    const lastRow = rows[rows.length - 1]
    if (lastRow.type === 'test' && !lastRow.end) {
      lastRow.end = time
      const { state } = JSON.parse(extra[0])
      lastRow.result = state
    }
  }
}

console.log(rows)

function draw(time: number) {
  const logTime = (time - config.offset) * 1000 + minTime

  let lastFinishedIndex = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].end) {
      if (logTime >= rows[i].end!) {
        lastFinishedIndex = i
      }
    }
  }

  let currentRowIndex = rows.length - 1
  for (let i = lastFinishedIndex + 1; i < rows.length; i++) {
    if (rows[i].begin) {
      currentRowIndex = i
      break
    }
  }

  const { width, height } = canvas

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Render title
  ctx.font = '32px Arimo'
  ctx.fillStyle = '#8b8685'
  for (let i = 0; i < config.title.length; i++) {
    const text = config.title[i]
    const y = 48 + i * 48
    ctx.fillText(text, 16, y)
  }

  const rowsToShow = 17
  const minRowIndex = Math.min(
    Math.max(0, currentRowIndex - rowsToShow + 3),
    rows.length - rowsToShow,
  )
  for (let i = 0; i < rowsToShow; i++) {
    const rowIndex = minRowIndex + i
    let row = rows[rowIndex]
    if (!row) {
      continue
    }

    if (row.depth > i) {
      // Search for the previous row with the same depth
      for (let j = rowIndex - 1; j >= 0; j--) {
        if (rows[j].depth === i) {
          row = rows[j]
          break
        }
      }
    }

    const x = 16 + row.depth * 24
    const rowHeight = 36
    const y = 128 + i * rowHeight

    // Draw background if active
    const rowIsActive = row.begin && logTime >= row.begin && logTime <= row.end!
    if (rowIsActive) {
      ctx.fillStyle = '#039'
      ctx.fillRect(0, y, width, rowHeight)
      const progress = (logTime - row.begin!) / (row.end! - row.begin!)
      ctx.fillStyle = '#04c'
      ctx.fillRect(0, y, width * progress, rowHeight)
    } else if (currentRowIndex === rowIndex) {
      ctx.fillStyle = '#333'
      ctx.fillRect(0, y, width, rowHeight)
    }

    // Draw text
    ctx.fillStyle = '#fff'
    if (row.end && logTime > row.end) {
      const result = row.result
      ctx.fillStyle =
        result === 'passed'
          ? '#6EE7B7'
          : result === 'failed'
          ? '#FCA5A5'
          : '#C4B5FD'
    }

    ctx.font = '21px Arimo'
    ctx.textAlign = 'left'

    const textY = y + 24
    fillTextTruncated(ctx, row.text, x, textY, width - x - 64)

    // Draw time
    ctx.textAlign = 'right'
    if (row.end && logTime >= row.end) {
      const result = row.result
      ctx.fillText(
        result === 'passed' ? '✔︎' : result === 'failed' ? '✘' : '-',
        width - 16,
        textY,
      )
    } else if (
      (row.begin && logTime > row.begin) ||
      currentRowIndex === rowIndex
    ) {
      ctx.fillStyle = '#fff5'
      ctx.fillText(formatDuration(logTime - row.begin!), width - 16, textY)
    }
  }

  {
    let textY = 800
    ctx.font = 'bold 21px Arimo'

    // Draw time
    ctx.textAlign = 'right'
    ctx.fillStyle =
      logTime < minTime ? '#8b8685' : logTime > maxTime ? '#FCD34D' : '#6EE7B7'
    {
      const timer = Math.min(logTime - minTime, maxTime - minTime)
      const text = formatTimer(timer)
      ctx.fillText(text, width - 16, textY)
    }

    ctx.textAlign = 'left'
    const currentRow = rows[currentRowIndex]
    if (currentRow) {
      const text = `Test ${currentRow.testNum} of ${numTests}`
      ctx.fillStyle = '#8b8685'
      ctx.fillText(text, 16, textY)

      textY += 36
      ctx.font = '28px Arimo'
      ctx.fillStyle = '#fff'
      fillTextWithWordWrapping(ctx, currentRow.text, 16, textY, width - 32, 36)
    }
  }
}

function formatDuration(n: number) {
  return (n / 1000).toFixed(1)
}

// M:SS.s
function formatTimer(n: number): string {
  if (n < 0) {
    return '-' + formatTimer(-n)
  }
  const sub = Math.floor((n % 1000) / 100)
  const seconds = Math.floor((n / 1000) % 60)
  const minutes = Math.floor(n / 60000)
  const text = `${minutes}:${seconds.toString().padStart(2, '0')}.${sub}`
  return text
}

// Fill text but truncates with ellipsis if it exceeds maxWidth
function fillTextTruncated(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  const textWidth = ctx.measureText(text).width
  if (textWidth <= maxWidth) {
    ctx.fillText(text, x, y)
    return
  }

  // Use binary search to find the last character that fits
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const midTextWidth = ctx.measureText(
      text.substring(0, mid).trim() + '…',
    ).width
    if (midTextWidth > maxWidth) {
      high = mid
    } else {
      low = mid + 1
    }
  }

  // Truncate text
  ctx.fillText(text.substring(0, low - 1).trim() + '…', x, y)
}

function fillTextWithWordWrapping(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ')
  while (words.length > 0) {
    // Determine the number of words that can be used on this line
    let numWords = 1
    for (let i = 2; i <= words.length; i++) {
      const wordWidth = ctx.measureText(words.slice(0, i).join(' ')).width
      if (wordWidth <= maxWidth) {
        numWords = i
      } else {
        break
      }
    }

    const line = words.slice(0, numWords).join(' ')
    ctx.fillText(line, x, y)
    y += lineHeight
    words.splice(0, numWords)
  }
}

let lastT = -1
function frame() {
  const t = video.currentTime
  if (t !== lastT) {
    lastT = t
    draw(t)
  }
  requestAnimationFrame(frame)
}
frame()

Object.assign(window, {
  getInfo: () => {
    return {
      width: canvas.width,
      height: canvas.height,
      fps: 60,
      numberOfFrames: ((maxTime - minTime) / 1000 + 20) * 60,
    }
  },
  seekToFrame: (frame: number) => {
    const t = frame / 60
    draw(config.offset + t - 10)
    return canvas.toDataURL('image/png')
  },
})
