import { useState, useEffect } from "react";

export const useTraceDrawer = (initialHeight: number = 400) => {
  const [treeHeight, setTreeHeight] = useState(initialHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ y: 0, initialHeight: 0 });

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      y: e.clientY,
      initialHeight: treeHeight,
    });
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const deltaY = e.clientY - dragStart.y;
      const newHeight = Math.max(
        200,
        Math.min(600, dragStart.initialHeight + deltaY)
      );
      setTreeHeight(newHeight);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return {
    treeHeight,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
};
