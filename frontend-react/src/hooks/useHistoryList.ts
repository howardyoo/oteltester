import { useCallback, useState } from 'react'

export function useHistoryList<T>() {
  const [items, setItems] = useState<T[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const append = useCallback((item: T) => {
    setItems((prev) => {
      const next = [...prev, item]
      setSelectedIndex(next.length - 1)
      return next
    })
  }, [])

  const updateSelected = useCallback((item: T) => {
    setItems((prev) => {
      if (selectedIndex < 0 || selectedIndex >= prev.length) return prev
      const next = [...prev]
      next[selectedIndex] = item
      return next
    })
  }, [selectedIndex])

  const select = useCallback((index: number) => {
    setSelectedIndex(index)
  }, [])

  return {
    items,
    selectedIndex,
    selectedItem: selectedIndex >= 0 ? items[selectedIndex] : undefined,
    append,
    updateSelected,
    select,
    setItems,
  }
}
