/**
 * Timeline (frame-based, scaleX-aware)
 * - Ruler shows frame ticks/labels (1, 2, 3, ...)
 * - Drag on the top ruler snaps time to nearest frame (using FPS)
 * - Wheel zoom keeps the time under the cursor stable
 * - Red time marker snaps to frames during seek AND playback
 * - Mouse positions are divided by scaleX() to compensate app-level CSS scaling
 */

import { UIPanel } from "./libs/ui.js"
import { TimelineAnimations } from "./TimelineAnimations.js"
import { TimelineCurves } from "./TimelineCurves.js"
import {
	scaleX,
	isTimeMarkDragged,
	setIsTimeMarkDragged,
	setCurrentAnimationTime,
	setPlayPressed,
	skeletonViewersSig,
} from "../../../src/scripts/store.js"

function Timeline(editor) {
	const signals = editor.signals
	const player = editor.player
	const ticksOffset = 200

	// --- Frame / scale helpers ------------------------------------------------
	const FPS = editor.fps ?? 90
	function timeToFrame(t) {
		return Math.round(t * FPS)
	}
	function frameToTime(f) {
		return f / FPS
	}
	function pxPerFrame() {
		return scale / FPS
	}

	// Single place to tweak the label column width
	const LABEL_COL_WIDTH = 200

	// Timeline scale: pixels per second
	let scale = 32

	const container = new UIPanel()
	container.setId("timeline")

	// Root timeline panel
	const timeline = new UIPanel()
	timeline.dom.className = "timeline-root"
	container.add(timeline)

	// Expose CSS vars so το CSS να ξέρει τα μεγέθη
	// (αν θες, μπορείς να τα ορίσεις και global, αλλά εδώ είναι τοπικά στο widget)
	timeline.dom.style.setProperty("--label-col-width", LABEL_COL_WIDTH + "px")
	timeline.dom.style.setProperty("--ruler-height", "32px")
	timeline.dom.style.setProperty("--ticks-offset", ticksOffset + "px")

	// Device pixel ratio for crisp ruler
	const devicePixelRatio = window.devicePixelRatio

	// Top ruler canvas (frame ticks)
	const canvas = document.createElement("canvas")
	canvas.className = "timeline-ruler"
	timeline.dom.appendChild(canvas)

	// Left fixed label column
	const labelContainer = document.createElement("div")
	labelContainer.className = "timeline-labels"
	timeline.dom.appendChild(labelContainer)

	// Scrollable main area (bars & curves)
	const scroller = document.createElement("div")
	scroller.className = "timeline-scroller"
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
	timeMark.className = "timeline-time-mark"
	timeMark.appendChild(createTimeMarkImage())
	timeline.dom.appendChild(timeMark)

	// Light loop overlay (optional)
	const loopMark = document.createElement("div")
	loopMark.className = "timeline-loop-mark"
	timeline.dom.appendChild(loopMark)

	// Keep time under mouse stable while zooming (wheel)
	timeline.dom.addEventListener("wheel", (event) => {
		if (event.ctrlKey === true) {
			event.preventDefault()

			const rect = timeline.dom.getBoundingClientRect()
			const mouseXInTimeline = (event.clientX - rect.left) / (scaleX() || 1)
			const mouseXInRuler = Math.max(0, mouseXInTimeline - LABEL_COL_WIDTH)

			const mouseTime = (scroller.scrollLeft + mouseXInRuler) / scale

			scale = Math.max(2, scale - event.deltaY / 10)
			signals.timelineScaled.dispatch(scale)

			scroller.scrollLeft = mouseTime * scale - mouseXInRuler
		}
	})

	// Seek by dragging on the top ruler (snap to frames)
	canvas.addEventListener(
		"mousedown",
		(event) => {
			event.preventDefault()
			const rect = timeline.dom.getBoundingClientRect()

			function clientXToSnappedTime(e) {
				const xInTimeline = (e.clientX - rect.left) / (scaleX() || 1)
				const xInRuler = Math.max(0, xInTimeline - LABEL_COL_WIDTH)
				const xScrolled = xInRuler + scroller.scrollLeft
				const t = Math.max(0, xScrolled / scale)
				const f = timeToFrame(t)
				return frameToTime(f)
			}

			function onMouseMove(e) {
				editor.setTime(clientXToSnappedTime(e))

				skeletonViewersSig().forEach((viewer) => {
					viewer.setAnimationTime(clientXToSnappedTime(e))
					viewer.action.paused = false
				})
				setCurrentAnimationTime(clientXToSnappedTime(e))

				setPlayPressed(true)

				console.log("Markeer!")
			}
			function onMouseUp(e) {
				onMouseMove(e)

				// skeletonViewersSig().forEach((viewer) => {
				// 	viewer.setAnimationTime(clientXToSnappedTime(e))
				// 	viewer.action.paused = false
				// })
				// setCurrentAnimationTime(clientXToSnappedTime(e))

				// setPlayPressed(true)

				setIsTimeMarkDragged(false)

				document.removeEventListener("mousemove", onMouseMove)
				document.removeEventListener("mouseup", onMouseUp)
			}
			setIsTimeMarkDragged(true)
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
		const TARGET_LABEL_PX = 40
		const dpr = devicePixelRatio

		// ruler height intrinsic για crispness
		canvas.height =
			parseInt(
				getComputedStyle(timeline.dom).getPropertyValue("--ruler-height")
			) * dpr
		// intrinsic width = scroller width + ticksOffset
		const cssWidth = scroller.clientWidth + ticksOffset
		canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
		canvas.style.width = cssWidth + "px"

		const ctx = canvas.getContext("2d", { alpha: false })
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

		// Background
		// ctx.fillStyle = "#555"
		ctx.fillStyle = "white"

		ctx.fillRect(0, 0, canvas.width, canvas.height)

		// Ticks
		ctx.save()
		ctx.translate(-scroller.scrollLeft + ticksOffset, 0)

		const totalFrames = Math.ceil(editor.duration * FPS)
		const ppf = pxPerFrame()

		const rawLabelStepF = Math.max(1, Math.ceil(TARGET_LABEL_PX / ppf))
		const NICE_STEPS = [
			1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 60, 75, 100, 120, 150, 200,
		]
		let labelStepF = NICE_STEPS.find((s) => s >= rawLabelStepF) || rawLabelStepF

		const minorDiv = labelStepF >= 10 ? 5 : labelStepF >= 5 ? 5 : 2
		const tickStepF = Math.max(1, Math.floor(labelStepF / minorDiv))

		ctx.strokeStyle = "#888"
		ctx.beginPath()
		for (let f = 0; f <= totalFrames; f += tickStepF) {
			const x = (f / FPS) * scale + 0.5
			const isMajor = f % labelStepF === 0
			const yTop = isMajor ? 16 : 22
			ctx.moveTo(x, yTop)
			ctx.lineTo(x, 26)
		}
		ctx.lineWidth = 1
		ctx.stroke()

		ctx.beginPath()
		for (let f = 0; f <= totalFrames; f += labelStepF) {
			const x = (f / FPS) * scale + 0.5
			ctx.moveTo(x, 16)
			ctx.lineTo(x, 26)
		}
		ctx.lineWidth = 2
		ctx.strokeStyle = "#9a9a9a"
		ctx.stroke()

		ctx.restore()

		// Labels
		ctx.font = "10px Arial"
		// ctx.fillStyle = "#cfcfcf"
		ctx.fillStyle = "#27272a"

		ctx.textAlign = "center"

		for (let f = 0; f <= totalFrames; f += labelStepF) {
			const x = (f / FPS) * scale - scroller.scrollLeft + ticksOffset
			const label = f === 0 ? "0" : String(f)
			ctx.fillText(label, x, 13)
		}
	}

	function updateContainers() {
		const width = editor.duration * scale
		elements.setWidth(width + "px")
		curves.setWidth(width + "px")
	}

	function updateTimeMark() {
		const left =
			player.currentTime * scale - scroller.scrollLeft - 8 + LABEL_COL_WIDTH
		timeMark.style.left = `${left}px`
		// console.log("player.time: ", player.currentTime)

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
	let _snappingGuard = false
	const EPS = 1e-9

	signals.durationChanged.add(() => {
		updateMarks()
		updateContainers()
	})

	signals.timeChanged.add(() => {
		if (!_snappingGuard) {
			const f = timeToFrame(player.currentTime)
			const snapped = frameToTime(f)
			if (Math.abs(snapped - player.currentTime) > EPS) {
				_snappingGuard = true
				editor.setTime(snapped)
				_snappingGuard = false
			}
		}
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
