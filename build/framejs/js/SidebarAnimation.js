/**
 * @author mrdoob / http://mrdoob.com/
 */

import {
	UIButton,
	UICheckbox,
	UIColor,
	UIHorizontalRule,
	UIInput,
	UIInteger,
	UINumber,
	UIPanel,
	UIRow,
	UISelect,
	UIText,
} from "./libs/ui.js"

function SidebarAnimation(editor) {
	const signals = editor.signals

	const container = new UIPanel()
	container.setId("animation")

	let selected = null
	let values

	// Helpers for frame <-> time using current editor.fps (fallback 90)
	function getFPS() {
		return editor.fps ?? 90
	}
	function timeToFrame(t) {
		return Math.round(t * getFPS())
	}
	function frameToTime(f) {
		return f / getFPS()
	}

	function createParameterRow(key, parameter) {
		if (parameter === null) return

		const parameterRow = new UIRow()
		parameterRow.add(new UIText(parameter.name).setWidth("90px"))

		if (parameter.isBoolean) {
			const parameterValue = new UICheckbox()
				.setValue(parameter.value)
				.onChange(function () {
					parameter.value = this.getValue()
					signals.animationModified.dispatch(selected)
				})
			parameterRow.add(parameterValue)
			values[key] = parameterValue
		} else if (parameter.isInteger) {
			const parameterValue = new UIInteger()
				.setRange(parameter.min, parameter.max)
				.setValue(parameter.value)
				.setWidth("150px")
				.onChange(function () {
					parameter.value = this.getValue()
					signals.animationModified.dispatch(selected)
				})
			parameterRow.add(parameterValue)
			values[key] = parameterValue
		} else if (parameter.isFloat) {
			const parameterValue = new UINumber()
				.setRange(parameter.min, parameter.max)
				.setValue(parameter.value)
				.setWidth("150px")
				.onChange(function () {
					parameter.value = this.getValue()
					signals.animationModified.dispatch(selected)
				})
			parameterRow.add(parameterValue)
			values[key] = parameterValue
		} else if (parameter.isVector2) {
			const vectorX = new UINumber()
				.setValue(parameter.value[0])
				.setWidth("50px")
				.onChange(function () {
					parameter.value[0] = this.getValue()
					signals.animationModified.dispatch(selected)
				})

			const vectorY = new UINumber()
				.setValue(parameter.value[1])
				.setWidth("50px")
				.onChange(function () {
					parameter.value[1] = this.getValue()
					signals.animationModified.dispatch(selected)
				})

			parameterRow.add(vectorX)
			parameterRow.add(vectorY)
		} else if (parameter.isVector3) {
			const vectorX = new UINumber()
				.setValue(parameter.value[0])
				.setWidth("50px")
				.onChange(function () {
					parameter.value[0] = this.getValue()
					signals.animationModified.dispatch(selected)
				})

			const vectorY = new UINumber()
				.setValue(parameter.value[1])
				.setWidth("50px")
				.onChange(function () {
					parameter.value[1] = this.getValue()
					signals.animationModified.dispatch(selected)
				})

			const vectorZ = new UINumber()
				.setValue(parameter.value[2])
				.setWidth("50px")
				.onChange(function () {
					parameter.value[2] = this.getValue()
					signals.animationModified.dispatch(selected)
				})

			parameterRow.add(vectorX)
			parameterRow.add(vectorY)
			parameterRow.add(vectorZ)
		} else if (parameter.isString) {
			const parameterValue = new UIInput()
				.setValue(parameter.value)
				.setWidth("150px")
				.onKeyUp(function () {
					parameter.value = this.getValue()
					signals.animationModified.dispatch(selected)
				})

			parameterRow.add(parameterValue)
		} else if (parameter.isColor) {
			const parameterValue = new UIColor()
				.setHexValue(parameter.value)
				.setWidth("150px")
				.onChange(function () {
					parameter.value = this.getHexValue()
					signals.animationModified.dispatch(selected)
				})

			parameterRow.add(parameterValue)
		}

		return parameterRow
	}

	function build() {
		container.clear()

		if (selected === null) return

		values = {}

		// Name
		{
			const row = new UIRow()
			row.add(new UIText("Name").setWidth("90px"))
			container.add(row)

			const animationName = new UIInput(selected.name)
			animationName.onChange(function () {
				selected.name = this.getValue()
				signals.animationRenamed.dispatch(selected)
			})
			row.add(animationName)
		}

		// Time (seconds)
		let fpsNumber, frameStartInt, frameEndInt

		{
			const row = new UIRow()
			row.add(new UIText("Time").setWidth("90px"))
			container.add(row)

			const animationStart = new UINumber(selected.start).setWidth("80px")
			animationStart.onChange(function () {
				selected.start = this.getValue()
				// Keep frame fields in sync
				if (frameStartInt) frameStartInt.setValue(timeToFrame(selected.start))
				if (frameEndInt) frameEndInt.setValue(timeToFrame(selected.end))
				signals.animationModified.dispatch(selected)
			})
			row.add(animationStart)

			const animationEnd = new UINumber(selected.end).setWidth("80px")
			animationEnd.onChange(function () {
				selected.end = this.getValue()
				// Keep frame fields in sync
				if (frameStartInt) frameStartInt.setValue(timeToFrame(selected.start))
				if (frameEndInt) frameEndInt.setValue(timeToFrame(selected.end))
				signals.animationModified.dispatch(selected)
			})
			row.add(animationEnd)
		}

		// FPS (single numeric) – sits just under Time
		{
			const row = new UIRow()
			row.add(new UIText("FPS").setWidth("90px"))
			container.add(row)

			fpsNumber = new UINumber(getFPS())
				.setWidth("80px")
				.setRange(1, 480)
				.onChange(function () {
					// Update editor.fps and resync frames display
					editor.fps = this.getValue()
					if (frameStartInt) frameStartInt.setValue(timeToFrame(selected.start))
					if (frameEndInt) frameEndInt.setValue(timeToFrame(selected.end))
					// If you want to broadcast this change, we could add signals.fpsChanged here
				})

			row.add(fpsNumber)
		}

		// Frames (start–end) – exactly below FPS
		{
			const row = new UIRow()
			row.add(new UIText("Frames").setWidth("90px"))
			container.add(row)

			frameStartInt = new UIInteger(timeToFrame(selected.start)).setWidth(
				"80px"
			)
			frameStartInt.onChange(function () {
				// Update start in seconds from frame
				selected.start = frameToTime(this.getValue())
				// Keep Time fields and end frame consistent
				signals.animationModified.dispatch(selected)
			})
			row.add(frameStartInt)

			frameEndInt = new UIInteger(timeToFrame(selected.end)).setWidth("80px")
			frameEndInt.onChange(function () {
				// Update end in seconds from frame
				selected.end = frameToTime(this.getValue())
				// Keep Time fields consistent
				signals.animationModified.dispatch(selected)
			})
			row.add(frameEndInt)
		}

		// Layer
		{
			const row = new UIRow()
			row.add(new UIText("Layer").setWidth("90px"))
			container.add(row)

			const animationLayer = new UIInteger(selected.layer).setWidth("80px")
			animationLayer.onChange(function () {
				selected.layer = this.getValue()
				signals.animationModified.dispatch(selected)
			})
			row.add(animationLayer)
		}

		// Enabled
		{
			const row = new UIRow()
			row.add(new UIText("Enabled").setWidth("90px"))
			container.add(row)

			const animationEnabled = new UICheckbox(selected.enabled)
			animationEnabled.onChange(function () {
				selected.enabled = this.getValue()
				signals.animationModified.dispatch(selected)
			})
			row.add(animationEnabled)
		}

		container.add(new UIHorizontalRule().setMargin("20px 0px"))

		// Effect selector
		{
			const row = new UIRow()
			row.add(new UIText("Effect").setWidth("90px"))
			container.add(row)

			const effects = editor.effects
			const options = {}
			for (let i = 0; i < effects.length; i++) options[i] = effects[i].name

			const effectsSelect = new UISelect().setWidth("130px")
			effectsSelect
				.setOptions(options)
				.setValue(effects.indexOf(selected.effect))
			effectsSelect.onChange(function () {
				editor.timeline.reset()
				selected.effect = editor.effects[this.getValue()]
				signals.animationModified.dispatch(selected)
				build()
			})
			row.add(effectsSelect)

			const edit = new UIButton("EDIT").setMarginLeft("8px")
			edit.onClick(function () {
				editor.selectEffect(selected.effect)
			})
			row.add(edit)
		}

		// Effect name
		{
			const row = new UIRow()
			row.add(new UIText("Name").setWidth("90px"))
			container.add(row)

			const effectName = new UIInput(selected.effect.name)
			effectName.onChange(function () {
				selected.effect.name = this.getValue()
				signals.effectRenamed.dispatch(selected.effect)
			})
			row.add(effectName)
		}

		// Effect parameters
		const parameters = selected.effect.program.parameters
		for (const key in parameters) {
			container.add(createParameterRow(key, parameters[key]))
		}
	}

	// Signals
	signals.editorCleared.add(function () {
		selected = null
		build()
	})

	signals.animationSelected.add(function (animation) {
		selected = animation
		build()
	})

	signals.effectCompiled.add(build)

	return container
}

export { SidebarAnimation }
