const errorLog = document.createElement('div')
errorLog.style.cssText = `
  position: fixed;
  bottom: 10px;
  right: 10px;
  width: 300px;
  max-height: 100%;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  background: rgba(0,0,0,0.7);
  padding: 8px;
  border-radius: 4px;
  pointer-events: auto;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 4px;
`
document.body.appendChild(errorLog)

const errorCounts = new Map()
const maxCompress = 5

function addMessage(type, msg) {
  if (msg == "Script error.") return;

  const key = type + msg
  const children = [...errorLog.children]
  const lastFive = children.slice(-maxCompress)
  const lastFiveKeys = lastFive.map(el => {
    for (const [k, v] of errorCounts.entries()) {
      if (v.elem === el) return k
    }
  })

  const lastKey = lastFiveKeys[lastFiveKeys.length - 1]

  if (lastKey === key) {
    const data = errorCounts.get(key)
    const newCount = data.count + 1
    errorCounts.set(key, {elem: data.elem, count: newCount, timeout: data.timeout})
    data.elem.textContent = `${msg} (x${newCount})`
    data.elem.style.opacity = '1'
    clearTimeout(data.timeout)
    const newTimeout = setTimeout(() => {
      data.elem.style.opacity = '0'
      setTimeout(() => {
        errorLog.removeChild(data.elem)
        errorCounts.delete(key)
      }, 500)
    }, 30000)
    errorCounts.set(key, {elem: data.elem, count: newCount, timeout: newTimeout})
    errorLog.scrollTop = errorLog.scrollHeight
    return
  }

  const item = document.createElement('div')
  item.textContent = msg
  item.style.cssText = `
    opacity: 0;
    transition: opacity 0.5s;
    pointer-events: none;
    color: ${type === 'error' ? 'orange' : type === 'warn' ? 'yellow' : 'white'};
  `
  errorLog.appendChild(item)
  requestAnimationFrame(() => item.style.opacity = '1')
  const timeout = setTimeout(() => {
    item.style.opacity = '0'
    setTimeout(() => {
      errorLog.removeChild(item)
      errorCounts.delete(key)
    }, 500)
  }, 30000)
  errorCounts.set(key, {elem: item, count: 1, timeout})
  errorLog.scrollTop = errorLog.scrollHeight
}

window.addEventListener('error', e => addMessage('error', e.message))
window.addEventListener('unhandledrejection', e => addMessage('error', e.reason?.message || String(e.reason)))

const originalLog = console.log
const originalWarn = console.warn
const originalError = console.error

console.log = (...args) => {
  addMessage('log', args.join(' '))
  originalLog.apply(console, args)
}
console.warn = (...args) => {
  addMessage('warn', args.join(' '))
  originalWarn.apply(console, args)
}
console.error = (...args) => {
  addMessage('error', args.join(' '))
  originalError.apply(console, args)
}
