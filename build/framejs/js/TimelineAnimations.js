import { UIPanel } from "./libs/ui.js"
import { WaveformGenerator } from "./WaveformGenerator.js"
import { scaleX, skeletonViewersSig } from "../../../src/scripts/store.js"
import { colors } from "../../../src/scripts/plots"

let scale = 32

// --- Frame snapping config ---
const FPS = 90
const MIN_FRAMES = 1
const MIN_DURATION = MIN_FRAMES / FPS

function snapTime(t) {
	return Math.round(t * FPS) / FPS
}

function clampNonNegative(start, end) {
	if (start < 0) {
		const off = -start
		start += off
		end += off
	}
	return [start, end]
}

/* ===========================
   DAW-style Mute/Solo helpers
   =========================== */

// Find viewer by label id (plotLabel)
function getViewerByLabel(label) {
	return skeletonViewersSig().find((v) => v.plotLabel === label)
}

// Ensure _mute/_solo flags exist on a viewer
function ensureFlags(v) {
	if (v._mute == null) v._mute = false
	if (v._solo == null) v._solo = false
	return v
}

// Recompute visibility for all viewers based on DAW rules
function recomputeMix() {
	const viewers = skeletonViewersSig().map(ensureFlags)
	const anySolo = viewers.some((v) => v._solo)

	viewers.forEach((v) => {
		// SOLO wins: if any solo is active -> visible iff solo==true (ignore mute)
		// If no solo -> visible iff not muted
		const plays = anySolo ? v._solo : !v._mute
		if (v.newParent) v.newParent.visible = !!plays
	})

	// Notify all blocks to sync their button visuals
	document.dispatchEvent(new CustomEvent("mix-changed"))
}

// Toggle helpers
function toggleMuteFor(label) {
	const v = getViewerByLabel(label)
	if (!v) return
	ensureFlags(v)
	v._mute = !v._mute
	recomputeMix()
}

function toggleSoloFor(label, { exclusive = false } = {}) {
	const viewers = skeletonViewersSig().map(ensureFlags)
	if (exclusive) {
		// Exclusive solo (DAW-style): the clicked one toggles; all others become false
		const target = viewers.find((x) => x.plotLabel === label)
		if (!target) return
		const next = !target._solo
		viewers.forEach((x) => (x._solo = x === target ? next : false))
	} else {
		// Multi-solo allowed
		const target = viewers.find((x) => x.plotLabel === label)
		if (!target) return
		target._solo = !target._solo
	}
	recomputeMix()
}

function TimelineAnimationBlock(editor, animation, labelContainer) {
	const signals = editor.signals

	const dom = document.createElement("div")
	dom.className = "block"
	dom.style.position = "absolute"
	dom.style.height = "31px"

	// Click on block to select the animation
	dom.addEventListener("click", () => {
		editor.selectAnimation(animation)
		console.log("crazy mouse clicked!")
	})

	// --- DRAG block ---
	// Keep your movementX/scaleX pattern; add snapping
	dom.addEventListener("mousedown", () => {
		let movementY = 0
		const start0 = animation.start
		const end0 = animation.end
		const durFrames = Math.max(MIN_FRAMES, Math.round((end0 - start0) * FPS))
		const durSec = durFrames / FPS

		function onMouseMove(e) {
			// Convert pixel delta to seconds, compensating app transform via scaleX()
			const dxPx = (e.movementX || 0) / (scaleX() || 1)
			const dxSec = dxPx / scale

			let newStart = animation.start + dxSec
			let newEnd = animation.end + dxSec

			// Snap start to nearest frame; preserve integer-frame duration
			newStart = snapTime(newStart)
			newEnd = newStart + durSec
			;[newStart, newEnd] = clampNonNegative(newStart, newEnd)

			// Vertical layer stepping unchanged
			movementY += e.movementY || 0
			if (movementY >= 30) {
				animation.layer += 1
				movementY = 0
			}
			if (movementY <= -30) {
				animation.layer = Math.max(0, animation.layer - 1)
				movementY = 0
			}

			animation.start = newStart
			animation.end = newEnd
			signals.animationModified.dispatch(animation)
		}

		function onMouseUp() {
			document.removeEventListener("mousemove", onMouseMove)
			document.removeEventListener("mouseup", onMouseUp)
		}

		document.addEventListener("mousemove", onMouseMove, false)
		document.addEventListener("mouseup", onMouseUp, false)
	})

	// --- Resize handles ---
	const resizeLeft = document.createElement("div")
	resizeLeft.style.position = "absolute"
	resizeLeft.style.width = "6px"
	resizeLeft.style.height = "30px"
	resizeLeft.style.cursor = "w-resize"
	resizeLeft.addEventListener("mousedown", (event) => {
		event.stopPropagation()

		const endAtDown = animation.end

		function onMouseMove(e) {
			const dxPx = (e.movementX || 0) / (scaleX() || 1)
			const dxSec = dxPx / scale

			let newStart = animation.start + dxSec
			let newEnd = endAtDown

			// Snap start, keep at least 1 frame
			newStart = snapTime(newStart)
			if (newEnd - newStart < MIN_DURATION) {
				newStart = newEnd - MIN_DURATION
				newStart = snapTime(Math.max(0, newStart))
			}

			;[newStart, newEnd] = clampNonNegative(newStart, newEnd)

			animation.start = newStart
			animation.end = newEnd
			signals.animationModified.dispatch(animation)
		}

		function onMouseUp() {
			document.removeEventListener("mousemove", onMouseMove)
			document.removeEventListener("mouseup", onMouseUp)
		}

		document.addEventListener("mousemove", onMouseMove, false)
		document.addEventListener("mouseup", onMouseUp, false)
	})
	dom.appendChild(resizeLeft)

	const name = document.createElement("div")
	name.className = "name"
	dom.appendChild(name)

	const resizeRight = document.createElement("div")
	resizeRight.style.position = "absolute"
	resizeRight.style.right = "0px"
	resizeRight.style.top = "0px"
	resizeRight.style.width = "6px"
	resizeRight.style.height = "30px"
	resizeRight.style.cursor = "e-resize"
	resizeRight.addEventListener("mousedown", (event) => {
		event.stopPropagation()

		const startAtDown = animation.start

		function onMouseMove(e) {
			const dxPx = (e.movementX || 0) / (scaleX() || 1)
			const dxSec = dxPx / scale

			let newEnd = animation.end + dxSec
			let newStart = startAtDown

			// Snap end, enforce min duration
			newEnd = snapTime(newEnd)
			if (newEnd - newStart < MIN_DURATION) {
				newEnd = snapTime(newStart + MIN_DURATION)
			}

			;[newStart, newEnd] = clampNonNegative(newStart, newEnd)

			animation.start = newStart
			animation.end = newEnd
			signals.animationModified.dispatch(animation)
		}

		function onMouseUp() {
			document.removeEventListener("mousemove", onMouseMove)
			document.removeEventListener("mouseup", onMouseUp)
		}

		document.addEventListener("mousemove", onMouseMove, false)
		document.addEventListener("mouseup", onMouseUp, false)
	})
	dom.appendChild(resizeRight)

	// --- Label block ---
	const label = document.createElement("div")
	label.className = "track-label"
	label.style.position = "absolute"
	label.style.height = "31px"
	label.style.display = "flex"
	label.style.alignItems = "center"
	label.style.gap = "8px"
	label.style.padding = "0 6px"
	// label.style.color = "#ccc"
	label.style.font = "12px monospace"
	label.style.left = "0"
	label.style.right = "0"
	label.style.background = colors[animation.layer - 1]

	const nameSpan = document.createElement("span")
	nameSpan.textContent = animation.effect.name

	const mute = document.createElement("button")
	mute.textContent = "M"
	mute.style.border = "none"
	mute.style.background = "#444"
	mute.style.color = "#fff"
	mute.style.padding = "2px 6px"
	mute.style.fontSize = "11px"
	mute.style.cursor = "pointer"

	const solo = document.createElement("button")
	solo.textContent = "S"
	solo.style.border = "none"
	solo.style.background = "#444"
	solo.style.color = "#fff"
	solo.style.padding = "2px 6px"
	solo.style.fontSize = "11px"
	solo.style.cursor = "pointer"

	const getLabelName = () =>
		animation.name || animation.effect?.name || "Unnamed"

	// Sync button visuals from the viewer flags (_mute/_solo)
	function syncButtonsFromViewer() {
		const v = getViewerByLabel(getLabelName())
		if (!v) return
		ensureFlags(v)

		// Mute visuals
		mute.classList.toggle("active", !!v._mute)
		mute.style.background = v._mute ? "#c0392b" : "#444"
		mute.setAttribute("aria-pressed", String(!!v._mute))

		// Solo visuals
		solo.classList.toggle("active", !!v._solo)
		solo.style.background = v._solo ? "#2e7d32" : "#444"
		solo.setAttribute("aria-pressed", String(!!v._solo))
	}

	// --- Mute toggle ---
	mute.addEventListener("click", (e) => {
		e.preventDefault()
		e.stopPropagation()

		toggleMuteFor(getLabelName())

		console.log(
			`Mute clicked — label "${getLabelName()}" (layer ${animation.layer})`
		)
	})

	// --- Solo toggle ---
	solo.addEventListener("click", (e) => {
		e.preventDefault()
		e.stopPropagation()

		// Alt/Option (or Meta) for exclusive solo behavior
		const exclusive = e.altKey || e.metaKey
		toggleSoloFor(getLabelName(), { exclusive })

		console.log(
			`Solo clicked — label "${getLabelName()}" (layer ${animation.layer})`
		)
	})

	// Listen for global mix recomputes to refresh button states
	const onMixChanged = () => syncButtonsFromViewer()
	document.addEventListener("mix-changed", onMixChanged)

	// Initial sync (in case flags already existed)
	syncButtonsFromViewer()

	label.append(nameSpan, mute, solo)

	// --- Load waveform ---
	async function updateWaveform() {
		const source = animation.effect?.source
		if (!source) return

		const match = source.match(/audio\.src\s*=\s*['"](.+?)['"]/)
		if (!match || !match[1]) return

		try {
			const response = await fetch(match[1])
			const arrayBuffer = await response.arrayBuffer()
			const ctx = new OfflineAudioContext({
				numberOfChannels: 1,
				length: 88200,
				sampleRate: 44100,
			})
			const buffer = await ctx.decodeAudioData(arrayBuffer)
			const generator = new WaveformGenerator()
			const svg = generator.generate(buffer, scale)
			dom.appendChild(svg)
		} catch (e) {
			console.error("Waveform error:", e)
		}
	}

	function getAnimation() {
		return animation
	}
	function select() {
		dom.classList.add("selected")
	}
	function deselect() {
		dom.classList.remove("selected")
	}

	// --- Update positions and sizes ---
	function update() {
		if (!animation.enabled) dom.classList.add("disabled")
		else dom.classList.remove("disabled")

		dom.style.left = animation.start * scale + "px"
		dom.style.top = animation.layer * 32 + "px"
		dom.style.width = (animation.end - animation.start) * scale + "px"

		label.style.top = animation.layer * 32 + "px"
		name.innerHTML = `${animation.name} <span style="opacity:0.5">${animation.effect.name}</span>`

		const last = dom.lastChild
		if (last?.tagName === "svg") {
			last.style.width = Number(last.getAttribute("width")) * scale + "px"
		}
	}

	// Provide a way to cleanup event listener when block is removed
	function dispose() {
		document.removeEventListener("mix-changed", onMixChanged)
	}

	update()
	updateWaveform()

	return { dom, label, update, select, deselect, getAnimation, dispose }
}

function TimelineAnimations(editor, labelContainer) {
	const container = new UIPanel()
	container.setHeight("100%")
	container.setBackground(
		"linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px) 0% 0% / 32px 32px repeat"
	)

	const blocks = {}
	let selected = null

	container.dom.addEventListener(
		"click",
		() => {
			console.log("Crazy mouse (click on empty timeline)")
			editor.selectAnimation(null)
		},
		true
	)

	editor.signals.animationAdded.add((animation) => {
		const block = TimelineAnimationBlock(editor, animation, labelContainer)
		container.dom.appendChild(block.dom)
		labelContainer.appendChild(block.label)
		blocks[animation.id] = block
	})

	editor.signals.animationModified.add((animation) =>
		blocks[animation.id]?.update()
	)

	editor.signals.animationSelected.add((animation) => {
		if (blocks[selected]) blocks[selected].deselect()
		if (!animation) return
		selected = animation.id
		blocks[selected].select()
	})

	editor.signals.animationRemoved.add((animation) => {
		const block = blocks[animation.id]
		if (block) {
			// Clean up the global listener for this block
			if (typeof block.dispose === "function") block.dispose()

			container.dom.removeChild(block.dom)
			labelContainer.removeChild(block.label)
			delete blocks[animation.id]
		}
	})

	editor.signals.timelineScaled.add((value) => {
		scale = value
		for (const key in blocks) blocks[key].update()
	})

	editor.signals.animationRenamed.add((animation) =>
		blocks[animation.id]?.update()
	)

	editor.signals.effectRenamed.add((effect) => {
		for (const key in blocks) {
			if (blocks[key].getAnimation()?.effect === effect) blocks[key].update()
		}
	})

	return container
}

export { TimelineAnimations }
