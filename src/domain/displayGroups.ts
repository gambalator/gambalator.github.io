export interface DisplayBlock {
  id: string
  entryIds: string[]
}

export function activeIdsAfterDisplayMove(
  blocks: DisplayBlock[],
  draggedId: string,
  overId: string,
  newestFirst: boolean,
): string[] | null {
  if (draggedId === overId) return null
  const from = blocks.findIndex((block) => block.id === draggedId)
  const to = blocks.findIndex((block) => block.id === overId)
  if (from < 0 || to < 0) return null
  const reordered = [...blocks]
  const [moved] = reordered.splice(from, 1)
  if (!moved) return null
  reordered.splice(to, 0, moved)
  const canonicalBlocks = newestFirst ? reordered.reverse() : reordered
  return canonicalBlocks.flatMap((block) => block.entryIds)
}
