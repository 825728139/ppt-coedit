import type { Component } from 'grapesjs';

/** Component.find() queries rendered DOM; inactive pages require model traversal. */
export function descendants(root: Component): Component[] {
  const result: Component[] = [];
  const visit = (parent: Component) => parent.components().forEach((child: Component) => {
    if(child.get('type') !== 'textnode') result.push(child);
    visit(child);
  });
  visit(root);
  return result;
}
export const slideRoot = (root: Component) => descendants(root).find(c => c.getClasses().includes('slide-root'));
