export function getComponentDeps(node: any) {
  const components = getComponentDepsRecursive(node, []);
  return components;
}

function getComponentDepsRecursive(node: any, components: any[]) {
  // components
}
