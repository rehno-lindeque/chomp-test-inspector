  var Editor = Editor || {};
  (function(html){
    var createEditor = function(fileName) {
      return html.div({class: "editor"},
        html.div({class: "editor-source"},
          html.input({class: "editor-source-filename", value: fileName}),
          html.editor()
        ),
        html.div({class: "editor-result"},
          html.input({class: "editor-result-filename", readonly: "readonly", value: fileName + ".??? (TODO)"}),
          html.editor()
        ),
        html.div({style: "clear:both"})
      );
    };
    Editor.handler = adt({
      ReloadFiles: function(files) { 
        var i;
        $('#editors').html();
        for (i = 0; i < files.length; ++i)
          $('#editors').append(createEditor(files[i]));
      },
      LoadFile: function(file) { 
        $('#editors').append(createEditor(file));
      }
    });
  })(adt({ editor: supersimple.editor.html }, html.evalCons));