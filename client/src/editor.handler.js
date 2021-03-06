  var Editor = Editor || {};
  (function(html){
    var 
      // Operational transform clients 
      // Keeps track of the synchronization state (synchronized/awaitingConfirm/awaitingWithBuffer) and revision number of a file
      otClients = {},
      createDropDownLog = function() {
        return html.div({class: "editor-log editor-log-empty"}, 
          html.div({class: "editor-log-dropdown"}),
          html.div({class: "editor-log-lines"})
        );
      },
      createEditor = function(fileName) {
        return html.div({class: "editor", 'data-filename': fileName},
          html.div({class: "editor-source editor-unloaded"},
            html.input({class: "editor-source-filename", value: fileName}),
            html.editor()
          ),
          html.div({class: "editor-result editor-unloaded"},
            html.input({class: "editor-result-filename", readonly: "readonly", value: fileName + ".output"}),
            html.editor(),
            createDropDownLog()
          ),
          html.div({style: "clear:both"})
        );
      },
      enableEditor = function() {
        $(".disable-overlay").hide();
      },
      disableEditor = function() {
        $(".disable-overlay").show();
      },
      showExitCode = adt({
        ExitSuccess: "Success",
        ExitFailure: function(code) { return "Failure: " + String(code); }
      }),
      createLogLine = adt({
        LogStart: function() { return html.div("Executing..."); },
        LogInfo: function(message) { return html.div({class: "editor-log-info"}, message); },
        LogError: function(message) { return html.div({class: "editor-log-error"}, message); },
        LogEnd: function(exitCode) { return html.div({class: "editor-log-end"}, "...Done (" + showExitCode(exitCode) + ")" ); }
      }),
      isResultFile = function(file) { return /\.output$/.test(file); },
      loadFile = function(file) {
        var
          isResult = isResultFile(file),
          baseFilename = isResult? file.slice(0, file.length - ".output".length) : file,
          $editors = $("#editors"),
          $editor = $editors.find(".editor[data-filename='" + baseFilename + "']"),
          selectorPrefix = isResult? ".editor-result" : ".editor-source",
          $editorFilename;
        if ($editor.length == 0)
          $editor = $(createEditor(baseFilename)).appendTo($editors);
        $editorFilename = $editor.find(selectorPrefix + "-filename"),
        $editor
          .find(selectorPrefix)
          .removeClass("editor-unloaded")
          .find(selectorPrefix + "-input")
          .empty()
      };

    Editor.getOTClient = function(file) {
      return otClients[file];
    };

    var storageEventHandler = adt({
      Connected: enableEditor,
      RestoredRootDirectory: enableEditor,
      MovedOutRootDirectory: disableEditor,
      DeleteRootDirectory: disableEditor,
      UnmountedRootDirectory: disableEditor
    });

    Editor.handler = adt({
      'StampedMessage _ _ OperationalTransform': function(clientId, timeStamp, message) {
        (function(file, revision, actions, opId) {
          if (otClients[file] == null) {
            console.error("...(error) no operational transform client for the file `" + String(file) + "`");
            return;
          }
          if (actions.length === 0)
            return;
          var
            i,
            op = new ot.Operation(revision, opId),
            opAction = adt({
              'Retain': function(n) { op.retain(n); },
              'Insert': function(t) { op.insert(t); },
              'Delete': function(n) { op.delete(n); }
            });
          for (i = 0; i < actions.length; ++i)
            opAction(actions[i]);
          otClients[file].applyServer(op);
          Editor.highlight(file);
        }).apply(this, message);
      },
      ProcessMessage: function(file, message) {
        var
          logLine = createLogLine(message),
          $editorLog = $("#editors")
            .find(".editor-source-filename[value='" + file + "']")
            .closest(".editor")
            .find(".editor-log")
            .removeClass('editor-log-empty'),
          $lines = $editorLog.find(".editor-log-lines");
        adt({ LogStart: function() { $lines.empty(); } })(message);
        $lines.append(logLine);
      },
      ReloadFiles: function(storageEvent, files) { 
        var i, f;
        storageEventHandler(storageEvent);
        $("#editors").html("");
        otClients = {};
        for (i = 0; i < files.length; ++i)
          loadFile(files[i]);
      },
      LoadFile: function(storageEvent, file) {
        storageEventHandler(storageEvent);
        delete otClients[file];
        loadFile(file);
      },
      UnloadFile: function(storageEvent, file) { 
        storageEventHandler(storageEvent);
        var
          isResult = isResultFile(file),
          baseFilename = isResult? file.slice(0, file.length - ".output".length) : file,
          $editors = $("#editors"),
          $editor = $editors.find(".editor[data-filename='" + baseFilename + "']"),
          thisPrefix = isResult? ".editor-result" : ".editor-source",
          otherPrefix = isResult? ".editor-source" : ".editor-result";
        delete otClients[file];
        if ($editor.length == 0)
          return;
        if ($editor.find(otherPrefix).hasClass('editor-unloaded'))
          $editor.remove();
        else {
          $editor
            .find(thisPrefix).addClass('editor-unloaded')
            .find(".supersimple-editor-input")
              .attr('contenteditable', false);
          Editor.clear(file);
        }
      },
      LoadFileContents: function(file, revision, contents) {
        var
          isResult = isResultFile(file),
          baseFilename = isResult? file.slice(0, file.length - ".output".length) : file,
          $editors = $("#editors"),
          $editor = $editors.find(".editor[data-filename='" + baseFilename + "']"),
          selector = isResult? ".editor-result" : ".editor-source",
          $editorInput = $editor.find(selector).find(".supersimple-editor-input");
        if ($editor.length !== 1 || $editorInput.length !== 1)
          return;
        otClients[file] = new Editor.OTClient(file, revision);
        $editorInput.attr('contenteditable', !isResult);
        Editor.update(file, contents);
        Editor.highlight(file);
      },
      UnloadFileContents: function(file) {
        var
          isResult = isResultFile(file),
          baseFilename = isResult? file.slice(0, file.length - ".output".length) : file,
          $editors = $("#editors"),
          $editor = $editors.find(".editor[data-filename='" + baseFilename + "']"),
          selector = isResult? ".editor-result" : ".editor-source",
          $editorInput = $editor.find(selector).find(".supersimple-editor-input");
        if ($editor.length !== 1 || $editorInput.length !== 1)
          return;
        delete otClients[file];
        $editorInput.attr('contenteditable', false);
        Editor.clear(file);
      },
      ConnectionClosed: function() {
        otClients = {};
        $("#editors").html("");
        disableEditor();
      },
      StampedMessage: function(clientId, timeStamp, message) { this(message); },
      _: function() { console.error("\t...(error) unknown message pattern `" + this._pattern + "` in editor handler"); }
    });

  })(adt({ editor: supersimple.editor.html }, html));
