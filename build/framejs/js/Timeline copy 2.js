/**
 * Timeline (refined)
 * - Drag on the top ruler to seek (mouse → time is scroll/scale aware)
 * - Alt + Wheel to zoom, keeping the time under the cursor stable
 * - Red time marker with head visible and above other layers
 * - Left label column (200px) accounted for in all position math
 */

import { UIPanel } from "./libs/ui.js"
import { TimelineAnimations } from "./TimelineAnimations.js"
import { TimelineCurves } from "./TimelineCurves.js"

function Timeline(editor) {
	const signals = editor.signals
	const player = editor.player

	// Single place to tweak the label column width
	const LABEL_COL_WIDTH = 200

	// Timeline scale: pixels per time unit (seconds)
	let scale = 32

	const container = new UIPanel()
	container.setId("timeline")

	// Root timeline panel
	const timeline = new UIPanel()
	timeline.setPosition("absolute")
	timeline.setLeft("0px")
	timeline.setTop("0px")
	timeline.setBottom("0px")
	timeline.setRight("0px")
	timeline.setOverflow("hidden")
	container.add(timeline)

	// Device pixel ratio for crisp ruler
	const devicePixelRatio = window.devicePixelRatio

	// Top ruler canvas (time ticks)
	const canvas = document.createElement("canvas")
	canvas.height = 32 * devicePixelRatio
	canvas.style.height = "32px"
	canvas.style.position = "absolute"
	canvas.style.left = `${LABEL_COL_WIDTH}px`
	canvas.style.right = "0px"
	canvas.style.top = "0px"
	canvas.style.zIndex = "1" // below the timeMark head, above background
	timeline.dom.appendChild(canvas)

	// Left fixed label column
	const labelContainer = document.createElement("div")
	labelContainer.style.position = "absolute"
	labelContainer.style.top = "32px"
	labelContainer.style.left = "0px"
	labelContainer.style.bottom = "0px"
	labelContainer.style.width = `${LABEL_COL_WIDTH}px`
	labelContainer.style.background = "#111"
	labelContainer.style.borderRight = "1px solid #333"
	labelContainer.style.overflow = "hidden"
	labelContainer.style.zIndex = "0"
	timeline.dom.appendChild(labelContainer)

	// Scrollable main area (bars & curves)
	const scroller = document.createElement("div")
	scroller.style.position = "absolute"
	scroller.style.top = "32px"
	scroller.style.left = `${LABEL_COL_WIDTH}px`
	scroller.style.bottom = "0px"
	scroller.style.right = "0px"
	scroller.style.overflow = "auto"
	scroller.style.zIndex = "0"
	timeline.dom.appendChild(scroller)

	// Bars (animations)
	const elements = new TimelineAnimations(editor, labelContainer)
	scroller.appendChild(elements.dom)

	// Curves (hidden by default)
	const curves = new TimelineCurves(editor)
	curves.setDisplay("none")
	scroller.appendChild(curves.dom)

	// Time marker (red vertical line + head)
	const timeMark = document.createElement("div")
	timeMark.style.position = "absolute"
	timeMark.style.top = "0px"
	timeMark.style.left = "-8px"
	timeMark.style.width = "16px"
	timeMark.style.height = "100%"
	timeMark.style.background =
		"linear-gradient(90deg, transparent 8px, #f00 8px, #f00 9px, transparent 9px) 0% 0% / 16px 16px repeat-y"
	timeMark.style.pointerEvents = "none"
	timeMark.style.marginTop = "16px"
	timeMark.style.zIndex = "10" // above everything
	timeMark.appendChild(createTimeMarkImage())
	timeline.dom.appendChild(timeMark)

	// Light loop overlay (optional)
	const loopMark = document.createElement("div")
	loopMark.style.position = "absolute"
	loopMark.style.top = "0"
	loopMark.style.height = "100%"
	loopMark.style.width = "0"
	loopMark.style.background = "rgba(255, 255, 255, 0.1)"
	loopMark.style.pointerEvents = "none"
	loopMark.style.display = "none"
	loopMark.style.zIndex = "2"
	timeline.dom.appendChild(loopMark)

	// Keep time under mouse stable while zooming with Alt + Wheel
	timeline.dom.addEventListener("wheel", (event) => {
		// if (event.altKey === true) {
		event.preventDefault()

		// Mouse X relative to the whole timeline
		const rect = timeline.dom.getBoundingClientRect()
		const mouseXInTimeline = event.clientX - rect.left

		// Mouse X relative to the scroller/ruler area (ignore the label column)
		const mouseXInRuler = Math.max(0, mouseXInTimeline - LABEL_COL_WIDTH)

		// Compute the time under the cursor before zooming
		const mouseTime = (scroller.scrollLeft + mouseXInRuler) / scale

		// Update scale (clamp to keep sane)
		scale = Math.max(2, scale - event.deltaY / 10)
		signals.timelineScaled.dispatch(scale)

		// Adjust scroll to keep the same time under cursor
		scroller.scrollLeft = mouseTime * scale - mouseXInRuler
		// }
	})

	// Seek by dragging on the top ruler
	canvas.addEventListener(
		"mousedown",
		(event) => {
			event.preventDefault()

			// Cache rect on mousedown; if layout changes during drag it’ll still be fine for short drags
			const rect = timeline.dom.getBoundingClientRect()

			function clientXToTime(e) {
				// X relative to timeline, then subtract label width to align with scroller content
				const xInTimeline = e.clientX - rect.left
				const xInRuler = Math.max(0, xInTimeline - LABEL_COL_WIDTH)
				const xScrolled = xInRuler + scroller.scrollLeft
				return Math.max(0, xScrolled / scale)
			}

			function onMouseMove(e) {
				editor.setTime(clientXToTime(e))
			}

			function onMouseUp(e) {
				onMouseMove(e)
				document.removeEventListener("mousemove", onMouseMove)
				document.removeEventListener("mouseup", onMouseUp)
			}

			document.addEventListener("mousemove", onMouseMove, false)
			document.addEventListener("mouseup", onMouseUp, false)
		},
		false
	)

	// Scroll updates ruler ticks and time marker position
	scroller.addEventListener(
		"scroll",
		() => {
			updateMarks()
			updateTimeMark()
		},
		false
	)

	// ---- Drawing / Layout helpers ------------------------------------------

	function updateMarks() {
		// Match the visible width of scroller (in CSS pixels)
		canvas.width = scroller.clientWidth * devicePixelRatio
		canvas.style.width = scroller.clientWidth + "px"

		const ctx = canvas.getContext("2d", { alpha: false })
		ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

		// Background
		ctx.fillStyle = "#555"
		ctx.fillRect(0, 0, canvas.width, canvas.height)

		// Ticks
		ctx.strokeStyle = "#888"
		ctx.beginPath()

		// Translate so ticks scroll with content
		ctx.save()
		ctx.translate(-scroller.scrollLeft, 0)

		const duration = editor.duration
		const width = duration * scale
		const scale4 = scale / 4

		for (let i = 0.5; i <= width; i += scale) {
			// Main second tick
			ctx.moveTo(i, 18)
			ctx.lineTo(i, 26)

			// Subdivisions
			if (scale > 16) {
				ctx.moveTo(i + scale4 * 1, 22)
				ctx.lineTo(i + scale4 * 1, 26)
			}
			if (scale > 8) {
				ctx.moveTo(i + scale4 * 2, 22)
				ctx.lineTo(i + scale4 * 2, 26)
			}
			if (scale > 16) {
				ctx.moveTo(i + scale4 * 3, 22)
				ctx.lineTo(i + scale4 * 3, 26)
			}
		}

		ctx.stroke()
		ctx.restore()

		// Labels (minutes:seconds)
		ctx.font = "10px Arial"
		ctx.fillStyle = "#888"
		ctx.textAlign = "center"

		const step = Math.max(1, Math.floor(64 / scale))
		for (let i = 0; i < duration; i += step) {
			const minute = Math.floor(i / 60)
			const second = Math.floor(i % 60)
			const text = `${minute}:${second.toString().padStart(2, "0")}`
			// Convert time to x in ruler space, then subtract scroll so it stays visible
			const x = i * scale - scroller.scrollLeft
			ctx.fillText(text, x, 13)
		}
	}

	function updateContainers() {
		const width = editor.duration * scale
		elements.setWidth(width + "px")
		curves.setWidth(width + "px")
	}

	function updateTimeMark() {
		// Position in the global timeline container (includes left label width)
		const left =
			player.currentTime * scale - scroller.scrollLeft - 8 + LABEL_COL_WIDTH
		timeMark.style.left = `${left}px`

		// Optional loop overlay alignment (in timeline container coordinates)
		const loop = player.getLoop()
		if (Array.isArray(loop)) {
			const loopStart = loop[0] * scale
			const loopEnd = loop[1] * scale
			loopMark.style.display = ""
			loopMark.style.left =
				loopStart - scroller.scrollLeft + LABEL_COL_WIDTH + "px"
			loopMark.style.width = loopEnd - loopStart + "px"
		} else {
			loopMark.style.display = "none"
		}
	}

	function createTimeMarkImage() {
		const c = document.createElement("canvas")
		c.width = 16
		c.height = 16
		const ctx = c.getContext("2d")
		ctx.fillStyle = "#f00"
		ctx.beginPath()
		ctx.moveTo(2, 0)
		ctx.lineTo(14, 0)
		ctx.lineTo(14, 10)
		ctx.lineTo(8, 16)
		ctx.lineTo(2, 10)
		ctx.closePath()
		ctx.fill()
		return c
	}

	// ---- Signals ------------------------------------------------------------

	signals.durationChanged.add(() => {
		updateMarks()
		updateContainers()
	})

	signals.timeChanged.add(() => {
		updateTimeMark()
	})

	signals.timelineScaled.add((value) => {
		scale = value
		updateMarks()
		updateTimeMark()
		updateContainers()
	})

	signals.windowResized.add(() => {
		updateMarks()
		updateContainers()
	})

	signals.showAnimations.add(() => {
		elements.setDisplay("")
		curves.setDisplay("none")
	})

	signals.showCurves.add(() => {
		elements.setDisplay("none")
		curves.setDisplay("")
	})

	// Initial layout
	requestAnimationFrame(() => {
		updateMarks()
		updateContainers()
		updateTimeMark()
	})

	return container
}

export { Timeline }
