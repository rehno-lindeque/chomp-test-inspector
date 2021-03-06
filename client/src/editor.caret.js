  var Editor = Editor || {};
  (function(){
    var
      getTextContent = function(domElement) {
        return domElement.innerText? domElement.innerText : domElement.textContent;
      },
      getNodeOffset = function(childNode) {
        var 
          prevNode = childNode.previousSibling,
          offset = 0;
        // If this is a div then it moves children and next siblings to the next line
        // (Chromium inserts divs for newlines with contenteditable elements)
        if (childNode["tagName"] && childNode["tagName"] === 'DIV')
          ++offset;
        if (!prevNode)
          return offset;
        // The previous node may contain a <br> tag if it is completely empty...
        // Therefore, it is not possible to use getTextContent here because it
        // will add a second newline to the counter in this case.
        // TODO: This may still be broken when pasting text into the editor...
        //       because it assumes that the <br> element is followed by a <div>
        //       element.
        //return offset + getTextContent(prevNode).length + getNodeOffset(prevNode);        
        return offset + prevNode.textContent.length + getNodeOffset(prevNode);
      },
      getParentNodeOffset = function(parentNode, childNode) {
        var offset = getNodeOffset(childNode);
        if (childNode.parentNode === parentNode)
          return offset;
        // If this is a div then it moves children and next siblings to the next line
        // (Chromium inserts divs for newlines with contenteditable elements)
        return offset + getParentNodeOffset(parentNode, childNode.parentNode);
      },
      getFocusPointAtOffset = function(rootNode, offset) {
        var
          childNode = rootNode.firstChild,
          parentOffset = 0,
          lastChildNode,
          textLength,
          descendant;
        if (offset == 0)
          return [rootNode, 0];
        if (childNode === null)
          return [rootNode, Math.min(offset, getTextContent(rootNode).length)];
        while (childNode) {
          // Skip nodes that fall behind the offset (calculate offset to parent node)
          textLength = getTextContent(childNode).length;
          if (parentOffset + textLength <= offset) {
            parentOffset += textLength;
            childNode = childNode.nextSibling;
            continue;
          }
          // The node containing the offset is some descendant of this childNode
          descendant = getFocusPointAtOffset(childNode, offset - parentOffset);
          return descendant;
        }
        // Offset is past the end of the text content
        return getFocusPointAtOffset(rootNode.lastChild, offset);
      };
    
    Editor.getCaretOffset = function(domElement) {
      if (!window.getSelection)
        return null;
      var selection = window.getSelection();
      if (!selection.containsNode(domElement, true)) 
        return null;
      if (selection.focusNode === domElement)
        return selection.focusOffset;
      if (selection.focusNode == null)
        return null;
      return getParentNodeOffset(domElement, selection.focusNode) + selection.focusOffset;
    };

    Editor.setCaretOffset = function(domElement, offset) {
      if (!window.getSelection)
        return;
      var
        selection = window.getSelection(),
        focusPoint = getFocusPointAtOffset(domElement, offset),
        range = document.createRange();
      // Remove existing selections
      if (selection.rangeCount > 0)
        selection.removeAllRanges();
      // Set the new selection to the focus point
      range.setStart(focusPoint[0], focusPoint[1]);
      range.setEnd(focusPoint[0], focusPoint[1]);
      selection.addRange(range);
    };

    Editor.getCaretSelection = function(domElement) {
      var 
        focusOffset = Editor.getCaretOffset(domElement),
        selection;
      if (focusOffset == null)
        return [null, null];
      if (!window.getSelection)
        return [null, focusOffset];
      selection = window.getSelection();
      if (!selection.containsNode(domElement, true)) 
        return [null, focusOffset];
      if (selection.anchorNode === domElement)
        return [selection.anchorOffset, focusOffset];
      if (selection.anchorNode == null)
        return [null, focusOffset];
      return [
        getParentNodeOffset(domElement, selection.anchorNode) + selection.anchorOffset,
        focusOffset
      ];
    };
  })();