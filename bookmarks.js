#import './cocoascript_modules/ui.js'
#import './preferences.js'
#import './cocoascript_modules/narrator.js'
#import './cocoascript_modules/sketch-query.js'
#import './utils.js'
(function(){
    var root = this;

    var Bookmarker = {};

    var Action = {
        Pan: "pan",
        ZoomToFit: "zoomToFit"
    };

    var RulersAction = {
        None: "none",
        Hide: "hide",
        Show: "show"
    };

    var SelectionAction = {
        None: "none",
        Hide: "hide",
        Show: "show"
    };

    var ZoomBehaviour = {
        KeepCurrent: "keepCurrent",
        SetTo100Percent: "setTo100Percent",
        RestoreFromBookmark: "restoreFromBookmark"
    };

    var bookMarkVersion="1";

    function bookmarkWithID(bookmarks,id) {
        for(var i=0;i<bookmarks.length;i++) {
            var bookmark=bookmarks[i];

            if(bookmark.id==id) {
                return bookmark;
            }
        }

        return null;
    }

    function normalizeIconScaleFactor(path) {
        var parts=path.split(".png");
        return parts[0]+(NSScreen.isOnRetinaScreen() ? "@2x" : "")+".png"
    }

    var preferences = Preferences.get();

    Bookmarker.removeBookmarksWithID = function(ids,meta,saveMeta) {
        var meta = meta || this.meta();
        if(!meta) return;

        var saveMeta = saveMeta || true;

        if(utils.isString(ids)) {
            ids=[ids];
        } else if(!utils.isArray(ids)) {
            return;
        }

        var bookmarks = meta.bookmarks;
        if(bookmarks.length<1) return;

        var map ={};
        for(var i=0;i<ids.length;i++) {
            var id=ids[i];
            map[id]=true;
        }

        for(var i=bookmarks.length-1;i>=0;i--) {
            var bookmark=bookmarks[i];
            if(map[bookmark.id]) {
                bookmarks.splice(i, 1);

                // Erase slot.
                if(meta.slots[bookmark.slot]) {
                    delete meta.slots[bookmark.slot];
                }
            }
        }

        if(saveMeta) this.saveMeta(meta);
    };

    Bookmarker.setSlot = function(slotNumber,customSetup,target) {
        if(slotNumber<1 || slotNumber>10) return;
        var customSetup = customSetup || false;
        var target = target || selection;

        this.toggleBookmark(target,customSetup,slotNumber);
    };

    Bookmarker.toggleBookmark = function(target,customSetup,slotNumber) {

        // Emtpy target case.
        if(target.count()<1) {
            // In case we have an artboard on the canvas we use it as a target
            var artboard=doc.currentPage().currentArtboard();
            if(artboard) {
                target=NSArray.arrayWithArray([artboard]);
            } else {
                // FIXME: Nothing is selected. What should we do about it??
                throw new Error("Selection is empty! There should be workaround for it!");
                return;
            }
        }

        // Gather a compound name from selected layers.
        var bookmarkName = MSLayerGroup.groupNameForLayers(target);
        if(!bookmarkName) {
            bookmarkName="Bookmark"+(slotNumber) ? "#"+slotNumber : "";
        } else {
            bookmarkName=bookmarkName.UTF8String();
        }

        // Default options for the bookmark.
        var bookmarkOptions = {
            name: bookmarkName,
            action: Action.Pan,
            zoomBehaviour: ZoomBehaviour.RestoreFromBookmark,
            selectLayers: false,
            rulersAction: RulersAction.None,
            selectionAction: SelectionAction.None,
            description: "Default Description"
        };


        if(customSetup) {
            var stopExecution=false;
            this.setupCustomBookmark(bookmarkOptions,function(data){
                if(data) {
                    bookmarkOptions=data;
                } else {
                    stopExecution=true;
                }
            },slotNumber);

            // Toggle bookmark operation has been canceled by user.
            if(stopExecution) return;
        }

        var meta=this.meta();

        // Find first empty slot.
        // If there is no any - slot remains undefined.
        if(!slotNumber) {
            for(var i=1;i<11;i++) {

                var slot=meta.slots[i.toString()];
                if(meta.slots[i.toString()]) {

                } else {
                    slotNumber= i.toString();
                    break;
                }
            }
        }

        // Check if there is a bookmark already exists at specified slot and remove it from the storage.
        if(slotNumber) {
            var bookmark = bookmarkWithID(meta.bookmarks,meta.slots[slotNumber.toString()]);
            if(bookmark) {
                var idx = meta.bookmarks.indexOf(bookmark);
                if (idx !== -1) {
                    meta.bookmarks.splice(idx, 1);
                }
            }
        }

        // Collect all the target layers identifiers.
        var IDs=[];
        for(var i=0;i<target.count();i++) {
            var layer=target.objectAtIndex(i);
            IDs.push(layer.objectID().UTF8String());
        }

        // Prepare and add bookmark.
        bookmark = {
            id: utils.generateGUID(),
            version: bookMarkVersion,

            targets: IDs,
            pageID: doc.currentPage().objectID().UTF8String(),

            name: bookmarkOptions.name,
            description: bookmarkOptions.description,
            action: bookmarkOptions.action,
            zoomBehaviour: bookmarkOptions.zoomBehaviour,
            rulersAction: bookmarkOptions.rulersAction,
            selectionAction: bookmarkOptions.selectionAction,
            selectLayers: bookmarkOptions.selectLayers,

            zoomValue: doc.currentPage().zoomValue(),
            rect: utils.rectFromGKRect(doc.currentView().totalRectForLayers(target)),
            slot: (slotNumber) ? slotNumber.toString() : slotNumber
        };

        meta.bookmarks.push(bookmark);

        // Assign bookmark to the slot and save all the data.
        if(slotNumber) meta.slots[slotNumber.toString()]=bookmark.id;
        this.saveMeta(meta);

        // Notifications.
        if(preferences.displayBookmarkToggleNotification) {
            var indexedMessage="Bookmark has been saved to slot #"+slotNumber+"  ";

            var zoomValue=parseInt((doc.currentPage().zoomValue()*100));
            var autoSelect=(bookmark.selectLayers) ? "On" : "Off";
            indexedMessage+="(Action: "+bookmark.action+" Zoom: "+zoomValue+"% "+"Auto-select: "+autoSelect+")";
            doc.displayMessage((slotNumber) ? indexedMessage : "Bookmark has been successfully added!");
        }

        if(preferences.playAudio && false) {
            this.playSound("Unlock.aif");
        }
    };

    Bookmarker.gotoSlot = function(slotNumber) {
        var meta = this.meta();
        var bookmark=bookmarkWithID(meta.bookmarks,meta.slots[slotNumber.toString()]);
        if(bookmark) {
            this.navigateToBookmark(bookmark,slotNumber);
        } else {
            doc.displayMessage("THIS SLOT IS EMPTY!");
            this.playSound("Funk.aiff");
        }
    };

    Bookmarker.eraseBookmark = function(bookmark) {

    };

    Bookmarker.navigateToBookmark = function(bookmark,slotNumber) {
        if(!bookmark) return;

        if(this.isInOverviewMode()) {
            this.removeRegionsOverlay();
        }

        // Check if bookmark is placed in a different page.
        if(doc.currentPage().objectID()!=bookmark.pageID) {
            var page=this.findPageByID(bookmark.pageID);
            if(page) {
                doc.setCurrentPage(page);

                var pagesController=doc.sidebarController().pagesViewController();
                pagesController.reloadData();
            } else {
                // FIXME: WARNING GOES HERE - IN CASE PAGE IS DEAD, WE CAN'T NAVIGATE!
                return;
            }
        }

        var targetLayers=this.findTargetLayers(bookmark.targets);
        if(targetLayers) {
            var view=doc.currentView();            
            var totalRect = view.totalRectForLayers(targetLayers);
            
            // Show/Hide Rulers.
            if(bookmark.rulersAction!=RulersAction.None) {
                utils.showRulers(bookmark.rulersAction==RulersAction.Show);
            }

            // Show/Hide Selection.
            if(bookmark.selectionAction!=SelectionAction.None) {
                utils.showSelection(bookmark.selectionAction==SelectionAction.Show);
            }

            var animate = preferences.animateWhenScrolling;
            if(bookmark.action==Action.Pan) {

                if(bookmark.zoomBehaviour==ZoomBehaviour.KeepCurrent) {
                    view.centerRect_animated(totalRect,animate);
                } else if(bookmark.zoomBehaviour==ZoomBehaviour.SetTo100Percent) {
                    view.setZoomValue(1);

                    // view.setZoomValueCenteredInCanvas(1);
                    view.centerRect_animated(totalRect,animate);


                } else if(bookmark.zoomBehaviour==ZoomBehaviour.RestoreFromBookmark) {

                    // view.setZoomValue(bookmark.zoomValue);

                    // view.setZoomValueCenteredInCanvas(bookmark.zoomValue); //

                    view.centerRect_animated(totalRect,false); // Animated causes problems here.
                    view.setZoomValueCenteredInCanvas(bookmark.zoomValue);



                    // view.setZoomValueCenteredInCanvas(bookmark.zoomValue);
                }

            } else if(bookmark.action==Action.ZoomToFit) {
                totalRect = totalRect.expandBy(preferences.zoomToFitExpansion);
                view.zoomToFitRect(totalRect);
            }

            if(bookmark.selectLayers && targetLayers.count()>0) {
                utils.currentPage().selectLayers(targetLayers);
            }

            if(preferences.displayBookmarkNavigateNotification) {
                if(slotNumber) {
                    doc.displayMessage("Navigated to bookmark #"+slotNumber+" - '"+bookmark.name+"'");
                } else {
                    doc.displayMessage("Navigated to bookmark '"+bookmark.name+"'");
                }
            }

            if(preferences.playAudio && false) {
                this.playSound("Submarine.aiff");
            }
        } else {
            throw new Error("This bookmark is dead!");
        }

        // this.playSound("Submarine.aiff");
    };

    Bookmarker.findPageByID = function(id) {
        var filter=NSPredicate.predicateWithFormat("objectID == %@",NSString.stringWithString(id));
        return doc.pages().filteredArrayUsingPredicate(filter).firstObject();
    };

    Bookmarker.findTargetLayers = function(targets) {
        var filter=NSPredicate.predicateWithFormat("objectID IN %@",targets);
        var result=doc.currentPage().children().filteredArrayUsingPredicate(filter);
        return result.count()<1 ? null : result;
    };

    Bookmarker.createMetaLayer = function() {
        var metaLayer = utils.createMetaLayer("#bookmarkerMetaLayer#",JSON.stringify({ bookmarks: [],slots: {} }));
        this.page().insertLayers_atIndex([metaLayer],0);

        return metaLayer;
    };

    Bookmarker.meta = function() {
        var filter=NSPredicate.predicateWithFormat("className == 'MSShapeGroup' && name == '#bookmarkerMetaLayer#'");
        var result=this.page().layers().array().filteredArrayUsingPredicate(filter);

        if(result.count()<1) {
            result=NSArray.arrayWithArray([this.createMetaLayer()]);
        }

        var metaLayer = result.firstObject();
        return JSON.parse(metaLayer.layers().firstObject().name());
    };

    Bookmarker.page = function() {
        return doc.pages().firstObject();
    };

    Bookmarker.saveMeta = function(obj) {
        var filter=NSPredicate.predicateWithFormat("className == 'MSShapeGroup' && name == '#bookmarkerMetaLayer#'");
        var result=this.page().layers().array().filteredArrayUsingPredicate(filter);

        if(result.count()<1) {
            result=NSArray.arrayWithArray([this.createMetaLayer()]);
        }

        var metaLayer = result.firstObject();
        metaLayer.layers().firstObject().name=JSON.stringify(obj);
    };

    Bookmarker.playSound = function(fileName) {
        var filePath = sketch.scriptPath.stringByDeletingLastPathComponent()+"/../assets/"+fileName;
        var sound = [[NSSound alloc] initWithContentsOfFile:filePath byReference:true];
        sound.play();

    };


    Bookmarker.setupCustomBookmark = function(options,callback,slotNumber) {
        var slotNumber = slotNumber || -1;

        var suffix = (NSScreen.isOnRetinaScreen()) ? "@2x" : "";
        var iconFilePath=(slotNumber==-1) ? "/assets/icons/custom_bookmark"+suffix+".png" : "/../assets/toggle_slot_icons/slot_"+slotNumber+suffix+".png";

        UI.showAlert({
            title: (slotNumber!=-1) ? "Toggle Bookmark: Slot #"+slotNumber : "Toggle Bookmark",
            description: "All the selected layers are going to be treated as a bookmark region. You can setup specific action to perform when navigating to the bookmark.",
            icon: iconFilePath,
            fields: {
                name: {
                    label: "Name:",
                    type: UI.AlertFieldType.String,
                    value: options.name,
                    placeholder: "Type a short meaningful name here..."
                },
                action: {
                    label: "Action To Perform:",
                    type: UI.AlertFieldType.Select,
                    value: ["Scroll","Zoom To Fit"],
                    defaultValue: "Scroll",
                    getter: function(value) {
                        var map = {
                            "scroll": Action.Pan,
                            "zoom to fit": Action.ZoomToFit
                        };
                        return map[value.toLowerCase()];
                    }
                },
                zoomBehaviour: {
                    label: "Zoom Behaviour:",
                    type: UI.AlertFieldType.Select,
                    value: ["Keep Current","Set to 100%","Restore from Bookmark"],
                    defaultValue: "Restore from Bookmark",
                    getter: function(value) {
                        var map = {
                            "keep current": ZoomBehaviour.KeepCurrent,
                            "set to 100%": ZoomBehaviour.SetTo100Percent,
                            "restore from bookmark": ZoomBehaviour.RestoreFromBookmark
                        };
                        return map[value.toLowerCase()];
                    }
                },
                rulersAction: {
                    label: "Rulers:",
                    type: UI.AlertFieldType.Select,
                    value: ["Do Nothing","Hide Rulers","Show Rulers"],
                    defaultValue: "Do Nothing",
                    getter: function(value,index) {
                        var map=[RulersAction.None,RulersAction.Hide,RulersAction.Show];
                        return map[index];
                    }
                },
                selectionAction: {
                    label: "Selection:",
                    type: UI.AlertFieldType.Select,
                    value: ["Do Nothing","Hide Selection","Show Selection"],
                    defaultValue: "Do Nothing",
                    getter: function(value,index) {
                        var map=[SelectionAction.None,SelectionAction.Hide,SelectionAction.Show];
                        return map[index];
                    }
                },
                selectLayers: {
                    label: "Select bookmarked layers:",
                    type: UI.AlertFieldType.Boolean,
                    value: options.selectLayers
                }
                /*,
                description: {
                    label: "Bookmark Description:",
                    type: UI.AlertFieldType.String,
                    value: "",
                    placeholder: "Type an extended description of the bookmark here..."
                }*/
            },
            buttons:[
                {
                    title: "OK",
                    onClick: function(data) {
                        callback(data);
                    }
                },
                {
                    title:  "Cancel",
                    onClick: function() {
                        callback(null);
                    }
                }
            ]
        });
    };

    Bookmarker.toggleCustomBookmark = function() {

        /*
        this.setupCustomBookmark("YES!",function(data){
            print(data);
        });
        */
        this.toggleBookmark(selection,true);

    };

    Bookmarker.showNavigationPanel = function() {

        var meta=this.meta();

        function bookmarkNames(bookmarks) {
            var names=[];
            for(var i=0;i<bookmarks.length;i++) {
                names.push(bookmarks[i].name);
            }

            return names;
        }

        var names = bookmarkNames(meta.bookmarks);
        print(names);

        UI.showAlert({
            title: "Navigate to Bookmark",
            icon: normalizeIconScaleFactor("/assets/icons/fuzzy_search.png"),
            fields: {
                bookmark: {
                    label: "Select bookmark to navigate to:",
                    type: UI.AlertFieldType.Select,
                    value: names,
                    defaultValue: "",
                    getter: function(value,index) {
                        return {
                            stringValue: value,
                            index: index
                        };
                    }
                }
            },
            buttons: [
                {
                    title: "OK",
                    onClick: function(data) {
                        if(data) {
                            var bookmark = meta.bookmarks[data.bookmark.index];
                            Bookmarker.navigateToBookmark(bookmark,bookmark.slot);
                        } else {
                            throw new Error("Can't get data from Alert!");
                        }

                    }
                },
                {
                    title: "Cancel"
                }
            ]
        });
    };

    Bookmarker.cyclingInfo = function(meta,increment) {
        var increment = increment || 0;

        var persistent=NSThread.currentThread().threadDictionary();
        var key="com.turbobabr.sketchplugins.bookmarker.currentBookmarkIndex";

        var info = null;

        var index=persistent[key];
        if(index!=null) {
            var length=meta.bookmarks.length;
            if(length<1) return null;

            info= {
                prevBookmarkIndex: (index-1<0) ? length-1 : index-1,
                nextBookmarkIndex: (index+1>=length) ? 0 : index+1
            };

        } else {
            info={
                prevBookmarkIndex: 0,
                nextBookmarkIndex: 1
            };

            persistent[key]=0;
        }

        if(increment!=0) {
            index=index+increment;
            persistent[key]=(increment<0) ? info.prevBookmarkIndex : info.nextBookmarkIndex;
        }

        return info;
    };

    Bookmarker.navigateNext = function() {
        var meta=this.meta();
        if(meta) {
            var info=this.cyclingInfo(meta,1);
            var bookmark = meta.bookmarks[info.nextBookmarkIndex];

            this.navigateToBookmark(bookmark,bookmark.slot);
        } else {
            throw new Error("Can't get meta data!");
        }

    };

    Bookmarker.navigatePrev = function() {
        var meta=this.meta();
        if(meta) {
            var info=this.cyclingInfo(meta,-1);
            var bookmark = meta.bookmarks[info.prevBookmarkIndex];

            this.navigateToBookmark(bookmark,bookmark.slot);
        } else {
            throw new Error("Can't get meta data!");
        }
    };

    Bookmarker.showButtonBar = function() {

    };

    Bookmarker.preferences = function() {
        Preferences.show();
    };


    Bookmarker.isInOverviewMode = function() {
        return SketchQuery.find(utils.currentPage().layers().array(),"ANY layers.array.name == '#allSelectorsMetaLayer#'")!=null;
    };

    Bookmarker.removeRegionsOverlay = function() {
        var overlay=SketchQuery.findOne(utils.currentPage().layers().array(),"ANY layers.array.name = '#allSelectorsMetaLayer#'");        
        if(overlay) {
            overlay.removeFromParent();
        }
    };

    Bookmarker.enterOverviewMode = function() {



        /*
         var zoomValueKey ="com.turbobabr.bookmarker.location.zoomValue";
         var scrollOriginKey ="com.turbobabr.bookmarker.location.scrollOrigin";

         var persistent=NSThread.currentThread().threadDictionary();
         var view=doc.currentView();


         function saveLocationData() {
         var midPoint=view.currentMidPoint();
         persistent[scrollOriginKey]=midPoint.x+","+midPoint.y;
         persistent[zoomValueKey]=doc.zoomValue();
         }

         function loadLocationData() {
         var midPoint=NSPointFromString(persistent[scrollOriginKey]);
         var zoomValue=persistent[zoomValueKey];


         doc.zoomValue = zoomValue;

         var rect=GKRect.rectWithRect(NSMakeRect(midPoint.x,midPoint.y,0,0));
         view.centerRect_animated(rect,true);
         }
         */

        utils.deselectAllLayers();

        var meta = Bookmarker.meta();
        var bookmarks=meta.bookmarks;

        var group=MSLayerGroup.alloc().init();
        group.name = "Bookmars Regions";

        // Add meta layer.
        var metaLayer=utils.createMetaLayer("#allSelectorsMetaLayer#","none");
        group.addLayers([metaLayer]);

        var currentPageID=utils.currentPage().objectID();
        for(var i=0;i<bookmarks.length;i++) {
            var bookmark=bookmarks[i];

            var target=Bookmarker.findTargetLayers(bookmark.targets);
            if(bookmark.pageID==currentPageID) {

                if(target!=null) {
                    // Update bookmark actual rect.
                    bookmark.rect=utils.rectFromGKRect(View.totalRect(target));

                    // Create region.
                    var region=this.createBookmarkRegion(bookmark);
                    group.insertLayers_afterLayer([region],metaLayer);
                } else {
                    throw new Error("There is a dead bookmark here!");
                }

            }
        }

        group.hasClickThrough=true;
        group.resizeRoot(true);

        utils.currentPage().addLayers([group]);
        View.centerLayersInCanvas();

    };

    Bookmarker.exitOverviewMode = function() {

        function findSelectorMeta(layer) {
            var metaLayer=SketchQuery.findOne(layer.layers().array(),"name == '#selectorMetaLayer#'");
            if(!metaLayer) return null;
            if(metaLayer.layers().count()<1) return null;

            return JSON.parse(metaLayer.layers().firstObject().name());
        }

        if(selection.count()==1)  {
            // Only one layer is selected.
            // If it's a bookmark region - we navigate to it, otherwise we center on selected layer.
            var layer = selection.firstObject();

            var bookmark=findSelectorMeta(layer);
            if(bookmark) {
                // Bookmarker.removeRegionsOverlay();
                // SpeakerDeck.showKeyStoke("control-z","Navigate To Selected Bookmarks");

                Bookmarker.navigateToBookmark(bookmark,bookmark.slot);
            } else {
                this.removeRegionsOverlay();
                View.centerRect(layer.absoluteRect());
            }

        } else if(selection.count()>1) {

            // SpeakerDeck.showKeyStoke("control-z","Zoom To Selected Bookmarks");
            View.zoomToSelection();
            Bookmarker.removeRegionsOverlay();
            utils.deselectAllLayers();

        } else {
            // SpeakerDeck.showKeyStoke("control-z","Restore Original Viewport");
            Bookmarker.removeRegionsOverlay();
            // loadLocationData();
        }
    };

    Bookmarker.createBookmarkRegion = function(bookmark) {

        var baseColor="#D0021B";

        function createIndexShape(index,size,iconScaleFactor) {
            var iconScaleFactor = iconScaleFactor || 0.7;

            var group=MSLayerGroup.alloc().init();

            // Add Index Background.
            var ovalShape = MSOvalShape.alloc().init();
            ovalShape.frame = MSRect.rectWithRect(NSMakeRect(0,0,size,size));

            var shapeGroup=ovalShape.embedInShapeGroup();
            var fill = shapeGroup.style().fills().addNewStylePart();
            fill.color = utils.colorWithHex(baseColor);

            group.addLayers([shapeGroup]);

            // Add Index Label.
            var label=group.addLayerOfType("text");
            label.stringValue=index.toString();
            label.fontSize=Math.round(size*iconScaleFactor);
            //label.adjustFrameToFit();
            label.textBehaviour=1;
            label.textAlignment=2;

            var fill = label.style().fills().addNewStylePart();
            fill.color = utils.colorWithHex("#ffffff");

            //label.frame().midX=shapeGroup.frame().midX();
            label.frame().x=shapeGroup.frame().x();
            label.frame().width=shapeGroup.frame().width();
            label.frame().midY=shapeGroup.frame().midY();
            // label.frame().makeRectIntegral();

            group.resizeRoot(true);

            return group;
        }

        var rc=View.totalRect(doc.currentPage().layers().array());
        var viewPort=View.view().viewPortForZoomToFitRect(rc);

        var group=MSLayerGroup.alloc().init();
        group.name=bookmark.name;

        // Add meta-layer.
        var metaLayer=utils.createMetaLayer("#selectorMetaLayer#",JSON.stringify(bookmark));
        group.addLayers([metaLayer]);


        var regionBackground = Shaper.rect(bookmark.rect,
            { color: baseColor, alpha: 0.03 },
            { color: baseColor, thickness: 1, position: BorderPosition.Outside}
        );

        group.addLayers([regionBackground]);


        // Label.
        var frame = regionBackground.frame();

        var label=group.addLayerOfType("text");
        label.fontSize=11*(1/viewPort.zoomValue());
        label.stringValue=bookmark.name;
        /*
         var fill = label.style().fills().addNewStylePart();
         fill.color = utils.colorWithHex("#ffffff");
         */
        Shaper.fill(label,{ color:"#ffffff"});

        label.frame().x=frame.x()+3;
        label.frame().y=frame.y()+3;

        label.adjustFrameToFit();

        // Add text background.
        var backgroundLayer =  Shaper.rect({
                x: frame.x()-1,
                y: frame.y()-1,
                width: label.frame().width()+10,
                height: label.frame().height()+8
            },
            { color: baseColor },null,"0/0/5/0");

        group.insertLayers_beforeLayer([backgroundLayer],label);

        if(bookmark.slot) {

            var indexSize=Math.round(16*(1/viewPort.zoomValue()));
            var indexPadding=3;
            var indexShape=createIndexShape(bookmark.slot,indexSize);
            indexShape.frame().x=regionBackground.frame().x()+bookmark.rect.width-indexSize-indexPadding;
            indexShape.frame().y=regionBackground.frame().y()+bookmark.rect.height-indexSize-indexPadding;

            group.insertLayers_afterLayer([indexShape],label);
        }

        group.resizeRoot(true);

        return group;
    };

    Bookmarker.validateEdit = function(layer) {
        if(this.isInOverviewMode() && layer.isKindOfClass(MSLayerGroup)) {
            var metaLayer=layer.layers().firstObject();
            if(metaLayer && metaLayer.name()=="#selectorMetaLayer#") {
                return true;
            }
        }

        return false;
    };

    Bookmarker.editBookmark = function(layer) {
        var metaLayer=layer.layers().firstObject();
        if(metaLayer && metaLayer.name()=="#selectorMetaLayer#") {
            var bookmark=JSON.parse(metaLayer.layers().firstObject().name());

            this.setupCustomBookmark(bookmark,function(options){
                print(options);
            },bookmark.slot);
        }
    };

    root.Bookmarker = Bookmarker;

}).call(this);