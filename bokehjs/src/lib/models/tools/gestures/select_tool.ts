import {GestureTool, GestureToolView} from "./gesture_tool"
import {GlyphRenderer} from "../../renderers/glyph_renderer"
import {GraphRenderer} from "../../renderers/graph_renderer"
import {DataRenderer} from "../../renderers/data_renderer"
import {compute_renderers, RendererSpec} from "../util"
import * as p from "core/properties"
import {KeyEvent, UIEvent} from "core/ui_events"
import {SelectionMode} from "core/enums"
import {Keys} from "core/dom"
import {SelectionGeometry} from "core/bokeh_events"
import {Geometry, GeometryData} from "core/geometry"
import {Signal0} from "core/signaling"
import {MenuItem} from "core/util/menus"
import {unreachable} from "core/util/assert"

export abstract class SelectToolView extends GestureToolView {
  model: SelectTool

  connect_signals(): void {
    super.connect_signals()
    this.model.clear.connect(() => this._clear())
  }

  get computed_renderers(): DataRenderer[] {
    const renderers = this.model.renderers
    const all_renderers = this.plot_model.renderers
    const names = this.model.names
    return compute_renderers(renderers, all_renderers, names)
  }

  _computed_renderers_by_data_source(): {[key: string]: DataRenderer[]} {
    const renderers_by_source: {[key: string]: DataRenderer[]} = {}

    for (const r of this.computed_renderers) {
      let source_id: string
      if (r instanceof GlyphRenderer)
        source_id = r.data_source.id
      else if (r instanceof GraphRenderer)
        source_id = r.node_renderer.data_source.id
      else
        continue

      if (!(source_id in renderers_by_source))
        renderers_by_source[source_id] = []

      renderers_by_source[source_id].push(r)
    }

    return renderers_by_source
  }

  protected _select_mode(ev: UIEvent): SelectionMode {
    const {shiftKey, ctrlKey} = ev

    if (!shiftKey && !ctrlKey)
      return this.model.mode
    else if (shiftKey && !ctrlKey)
      return "append"
    else if (!shiftKey && ctrlKey)
      return "intersect"
    else if (shiftKey && ctrlKey)
      return "subtract"
    else
      unreachable()
  }

  _keyup(ev: KeyEvent): void {
    if (ev.keyCode == Keys.Esc) {
      this._clear()
    }
  }

  _clear(): void {
    for (const renderer of this.computed_renderers) {
      renderer.get_selection_manager().clear()
    }
    this.plot_view.request_render()
  }

  _select(geometry: Geometry, final: boolean, mode: SelectionMode): void {
    const renderers_by_source = this._computed_renderers_by_data_source()

    for (const id in renderers_by_source) {
      const renderers = renderers_by_source[id]
      const sm = renderers[0].get_selection_manager()

      const r_views = []
      for (const r of renderers) {
        if (r.id in this.plot_view.renderer_views)
          r_views.push(this.plot_view.renderer_views[r.id])
      }
      sm.select(r_views, geometry, final, mode)
    }

    // XXX: messed up class structure
    if ((this.model as any).callback != null)
      (this as any)._emit_callback(geometry)

    this._emit_selection_event(geometry, final)
  }

  _emit_selection_event(geometry: Geometry, final: boolean = true): void {
    const {frame} = this.plot_view
    const xm = frame.xscales.default
    const ym = frame.yscales.default

    let geometry_data: GeometryData
    switch (geometry.type) {
      case "point": {
        const {sx, sy} = geometry
        const x = xm.invert(sx)
        const y = ym.invert(sy)
        geometry_data = {...geometry, x, y}
        break
      }
      case "span": {
        const {sx, sy} = geometry
        const x = xm.invert(sx)
        const y = ym.invert(sy)
        geometry_data = {...geometry, x, y}
        break
      }
      case "rect": {
        const {sx0, sx1, sy0, sy1} = geometry
        const [x0, x1] = xm.r_invert(sx0, sx1)
        const [y0, y1] = ym.r_invert(sy0, sy1)
        geometry_data = {...geometry, x0, y0, x1, y1}
        break
      }
      case "poly": {
        const {sx, sy} = geometry
        const x = xm.v_invert(sx)
        const y = ym.v_invert(sy)
        geometry_data = {...geometry, x, y}
        break
      }
    }

    this.plot_model.trigger_event(new SelectionGeometry(geometry_data, final))
  }
}

export namespace SelectTool {
  export type Attrs = p.AttrsOf<Props>

  export type Props = GestureTool.Props & {
    renderers: p.Property<RendererSpec>
    names: p.Property<string[]>
    mode: p.Property<SelectionMode>
  }
}

export interface SelectTool extends SelectTool.Attrs {}

export abstract class SelectTool extends GestureTool {
  properties: SelectTool.Props

  clear: Signal0<this>

  constructor(attrs?: Partial<SelectTool.Attrs>) {
    super(attrs)
  }

  initialize(): void {
    super.initialize()
    this.clear = new Signal0(this, "clear")
  }

  static init_SelectTool(): void {
    this.define<SelectTool.Props>({
      renderers: [ p.Any,   'auto'    ],
      names:     [ p.Array, []        ],
      mode:      [ p.Any,   "replace" ],
    })
  }

  get menu(): MenuItem[] | null {
    return [
      {
        icon: "bk-tool-icon-replace-mode",
        tooltip: "Replace the current selection",
        active: () => this.mode == "replace",
        handler: () => {
          this.mode = "replace"
          this.active = true
        },
      }, {
        icon: "bk-tool-icon-append-mode",
        tooltip: "Append to the current selection (Shift)",
        active: () => this.mode == "append",
        handler: () => {
          this.mode = "append"
          this.active = true
        },
      }, {
        icon: "bk-tool-icon-intersect-mode",
        tooltip: "Intersect with the current selection (Ctrl)",
        active: () => this.mode == "intersect",
        handler: () => {
          this.mode = "intersect"
          this.active = true
        },
      }, {
        icon: "bk-tool-icon-subtract-mode",
        tooltip: "Subtract from the current selection (Shift+Ctrl)",
        active: () => this.mode == "subtract",
        handler: () => {
          this.mode = "subtract"
          this.active = true
        },
      },
      null,
      {
        icon: "bk-tool-icon-clear-selection",
        tooltip: "Clear the current selection (Esc)",
        handler: () => {
          this.clear.emit()
        },
      },
    ]
  }
}
