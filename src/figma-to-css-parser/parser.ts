interface ElementNodeInfo {
  frameName?: string;
  children?: string | ElementNodeInfo[];

  // Layout properties
  display: "flex" | "block" | "grid";
  flexDirection?: "row" | "column";
  flexWrap?: "nowrap" | "wrap";
  gap?: string;
  justifyContent?: string;
  alignItems?: string;
  width?: string;
  height?: string;

  // padding
  padding?: string;
  paddingLeft?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingRight?: string;

  // New typography properties
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: "left" | "center" | "right";

  // Color and effects
  color?: string;
  opacity?: string;
  backgroundColor?: string;
  boxShadow?: string;
  borderRadius?: string;
  backdropFilter?: string;

  // border
  border?: string;
  borderLeft?: string;
  borderRight?: string;
  borderTop?: string;
  borderBottom?: string;
}

export function convertFigmaFrameToElement(node: any): ElementNodeInfo {
  const elm: ElementNodeInfo = { display: "block" };
  if (node.name) {
    elm.frameName = node.name;
  }

  if (node.type === "FRAME") {
    const paddingLeft = node.paddingLeft;
    const paddingRight = node.paddingRight;
    const paddingTop = node.paddingTop;
    const paddingBottom = node.paddingBottom;

    // if (paddingLeft && paddingRight && paddingTop && paddingBottom) {
    //   elm.padding = `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`;
    // } else {

    elm.paddingLeft = paddingLeft ? paddingLeft + "px" : undefined;
    elm.paddingRight = paddingRight ? paddingRight + "px" : undefined;
    elm.paddingTop = paddingTop ? paddingTop + "px" : undefined;
    elm.paddingBottom = paddingBottom ? paddingBottom + "px" : undefined;
    // }
  }

  // add padding
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    // Layout conversions (existing)
    elm.display = "flex";
    elm.flexDirection = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    if (node.layoutWrap === "WRAP") {
      elm.flexWrap = "wrap";
    }
    if (node.itemSpacing > 0) {
      elm.gap = `${node.itemSpacing}px`;
    }
  }

  // handle width and height
  if ("layoutSizingHorizontal" in node) {
    switch (node.layoutSizingHorizontal) {
      case "HUG":
        elm.width = "fit-content";
        break;
      case "FILL":
        elm.width = "100%";
        break;
      case "FIXED":
        elm.width = node.absoluteBoundingBox.width + "px";
        break;
    }
  }

  if ("layoutSizingVertical" in node) {
    switch (node.layoutSizingVertical) {
      case "HUG":
        elm.height = "fit-content";
        break;
      case "FILL":
        elm.height = "100%";
        break;
      case "FIXED":
        elm.height = node.absoluteBoundingBox.height + "px";
        break;
    }
  }

  // Flex alignment mappings
  const justifyContentMap = {
    MIN: "flex-start",
    MAX: "flex-end",
    CENTER: "center",
    SPACE_BETWEEN: "space-between",
    SPACE_AROUND: "space-around",
  };

  const alignItemsMap = {
    MIN: "flex-start",
    MAX: "flex-end",
    CENTER: "center",
    BASELINE: "baseline",
  };

  // Primary axis alignment (justify-content)
  if (node.primaryAxisAlignItems in justifyContentMap) {
    elm.justifyContent = justifyContentMap[node.primaryAxisAlignItems];
  } else {
    elm.justifyContent = alignItemsMap.MIN;
  }

  // Cross axis alignment (align-items)
  if (node.counterAxisAlignItems in alignItemsMap) {
    elm.alignItems = alignItemsMap[node.counterAxisAlignItems];
  } else {
    // if not specify, it is min
    elm.alignItems = alignItemsMap.MIN;
  }

  // Typography handling
  if (node.type === "TEXT") {
    elm.fontFamily = node.style.fontFamily;
    elm.fontSize = `${node.style.fontSize}px`;
    elm.fontWeight = node.style.fontWeight;
    elm.lineHeight = node.style.lineHeightPx
      ? `${node.style.lineHeightPx}px`
      : "normal";
    elm.letterSpacing = node.style.letterSpacing
      ? `${node.style.letterSpacing}px`
      : "0";
    elm.textAlign =
      node.style.textAlignHorizontal.toLowerCase() as CSS["textAlign"];
  }

  if ("fills" in node && node.fills?.length) {
    // Color conversions
    const primaryFill = node.fills.find((f) => f.visible !== false);
    if (primaryFill?.type === "SOLID") {
      elm.color = extractRGBAFromSolidFill(primaryFill);
    }
  }

  // add opacity
  if (node.opacity) {
    elm.opacity = `${node.opacity}`;
  }

  // Background and effects
  if ("backgrounds" in node && node.backgrounds?.length) {
    const bg = node.backgrounds[0];
    if (bg.type === "SOLID") {
      const { r, g, b, a } = bg.color;
      elm.backgroundColor = `rgba(${Math.round(r * 255)}, ${Math.round(
        g * 255
      )}, ${Math.round(b * 255)}, ${a})`;
    }
  }

  // Shadow and blur effects
  if ("effects" in node && node.effects?.length) {
    elm.boxShadow = node.effects
      .filter((e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")
      .map((e) => {
        const { offset, radius, color } = e;
        return `${offset?.x || 0}px ${offset?.y || 0}px ${radius || 0}px rgba(
          ${Math.round(color.r * 255)},
          ${Math.round(color.g * 255)},
          ${Math.round(color.b * 255)},
          ${color.a}
        )`;
      })
      .join(", ");
  }

  // Border radius
  if ("cornerRadius" in node && node.cornerRadius) {
    elm.borderRadius = `${String(node.cornerRadius)}px`;
  }

  if ("strokes" in node && node.strokes?.length) {
    const primaryStroke = node.strokes.find((f) => f.visible !== false);
    if (primaryStroke?.type === "SOLID") {
      const strokeColor = extractRGBAFromSolidFill(primaryStroke);

      if (node.individualStrokeWeights) {
        const { top, right, bottom, left } = node.individualStrokeWeights;
        elm.borderTop = top > 0 ? `${top}px solid ${strokeColor}` : undefined;
        elm.borderRight =
          right > 0 ? `${right}px solid ${strokeColor}` : undefined;
        elm.borderBottom =
          bottom > 0 ? `${bottom}px solid ${strokeColor}` : undefined;
        elm.borderLeft =
          left > 0 ? `${left}px solid ${strokeColor}` : undefined;
      } else {
        const strokeWeight = node.strokeWeight;
        elm.border = `${strokeWeight}px solid ${strokeColor}`;
      }
    }
  }

  // ======================================================
  // handle the children
  // ======================================================

  // return early if we are processing a text node
  if (node.type === "TEXT") {
    elm.children = node.characters;
    return elm;
  }

  // make it recursive if there is children nodes
  if (node.children && node.children.length > 0) {
    elm.children = node.children.map((child: any) => {
      if (child.type === "FRAME" || child.type === "TEXT") {
        return convertFigmaFrameToElement(child);
      }
    });
    return elm;
  }

  return elm;
}

function extractRGBAFromSolidFill(fill: any) {
  const { r, g, b, a } = fill.color;
  const red = Math.round(r * 255);
  const green = Math.round(g * 255);
  const blue = Math.round(b * 255);
  const alpha = fill.opacity;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
