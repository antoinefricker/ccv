var CCV;
var proto;

if (!CCV)
	CCV = {};

if (!CCV.app)
	CCV.app = {};


// ----------------------------------------------------------------------
// CCV.app.Player
// ----------------------------------------------------------------------
if(!CCV.app.Player){
	
	/**
	 * Singleton PIXI canvas player.
	 * @param target
	 * @param options
	 * @constructor
	 */
	CCV.app.Player = function(target, options){
		
		// ---   build options
		this.target = target;
		this.options = Object.assign({
			magnifierDisplayStatus: true,
			scenesShowFillStatus: true,
			configurationFile: 'json/config.json',
			spritesheetFile: 'ccv/x1/decors/ssComplete.json'
		}, options);
		
		this.animTicker = new CCV.app.AnimationsTicker();
		
		// ---   register core options
		
		CCV.player = this;
		
		this.mediaFolder = '';
		this.texturesCounter = 0;
		this.ssLoader = new PIXI.loaders.Loader();
		
		// ---   create application
		this.application = new PIXI.Application(800, 600, {
			backgroundColor: 0xffffff,
			view:  this.target,
			transparent:  false,
			antialias:  true,
			preserveDrawingBuffer:  false,
			resolution:  1,
			legacy:  false
		}, CCV.global.SYS_FORCE_CANVAS, CCV.global.SYS_USE_SHARED_TICKER);
		
		
		
		this.background = new PIXI.Graphics();
		this.background.beginFill(0x000000, 0);
		this.background.drawRect(0, 0, 100, 100);
		this.application.stage.addChild(this.background);
		
		this.menu = new CCV.app.FooterMenu();
		this.application.stage.addChild(this.menu.view);
		
		this.landscape = new CCV.app.Landscape();
		this.application.stage.addChild(this.landscape.view);
		
		this.magnifier = new CCV.app.Magnifier(CCV.global.MAGNIFIER_RADIUS);
		this.application.stage.addChild(this.magnifier.view);
		
		
		// --- callbacks
		
		this.initCallbacks();
		
		
		// --- window utilities
		
		// check for Internet Explorer - https://msdn.microsoft.com/en-us/library/ahx1z4fs(VS.80).aspx
		if(CCV.global.SYS_WIN_FOCUS_ACTIVATION) {
			if(/*@cc_on!@*/false) {
				document.onfocusin = this.cbks.activate;
				document.onfocusout = this.cbks.deactivate;
			}
			else {
				window.onfocus = this.cbks.activate;
				window.onblur = this.cbks.deactivate;
			}
		}
		window.onresize = this.cbks.resize;
		
		
		// --- launch display
		this.landscapeHeight = CCV.global.SCENE_MAX_HEIGHT;
		this.groundHeight = CCV.global.SCENE_GROUND_HEIGHT;
		this.resizeInit();
		
		this.loader = new PIXI.loaders.Loader();
		this.loader
			.add('config', this.options.configurationFile)
			.add(this.options.spritesheetFile)
			.load(this.configurationParse.bind(this))
			.onError.add(function(err){
				console.warn('main loader error', arguments);
			});
	};
	proto = CCV.app.Player.prototype;
	
	proto.initCallbacks = function(){
		this.cbks = {};
		
		// render activation
		this.cbks.activate = this.activateSet.bind(this, true);
		this.cbks.deactivate = this.activateSet.bind(this, false);
		// window resize
		this.cbks.resize = this.resize.bind(this);
		
		// landscape swipe handlers
		this.cbks.scrollCtx = {
			name: 'scrollCtx',
			active: false,
			startX: Number.NaN,
			startScrollPanelX: Number.NaN,
			elasticity: Number.NaN,
			scrollTargetX: Number.NaN
		};
		Object.seal(this.cbks.scrollCtx);
		
		this.cbks.scrollStart = this._scrollStart.bind(this);
		this.cbks.scrollEnd = this._scrollEnd.bind(this);
		this.cbks.scrollMove = this._scrollMove.bind(this);
		this.cbks.scrollApply = this._scrollApply.bind(this);
		
		// magnifier handlers
		this.cbks.mgCtx = {
			name: 'mgCtx',
			active: false,
			dragTouch: null,
			pinchTouch: null,
			pinchStartScale: Number.NaN,
			pinchStartDelta: Number.NaN,
			idleTimeoutId: null
		};
		Object.seal(this.cbks.mgCtx);
		
		this.cbks.magnifierDragScroll = this._mgDragScroll.bind(this);
		this.cbks.magnifierDragStart = this._mgDragStart.bind(this);
		this.cbks.magnifierDragMove = this._mgDragMove.bind(this);
		this.cbks.magnifierDragEnd = this._mgDragEnd.bind(this);
		
		this.cbks.refreshIndex = this.refreshIndex.bind(this);
	};
	
	// --------------- MODEL UTILITIES
	
	proto.getMode = function(){
		return this.application.renderer instanceof PIXI.WebGLRenderer ? 'WebGL' : 'canvas';
	};
	proto.configurationParse = function(data){
		this.initInteractions();
		 
		console.log(this.loader.resources.config.data);
		this.landscape.parse(this.loader.resources.config.data.landscape);
		
		this.resize();
		
		this.magnifierDisplayToggle(this.options.magnifierDisplayStatus);
		this.scenesShowFillToggle(this.options.scenesShowFillStatus !== false);
		
		this.landscape.setIndex(CCV.global.SCENE_START_RAND ? this.landscape.pickRandomIndex(false) : CCV.global.SCENE_START_INDEX, true, false);
		
		this.activateSet(CCV.global.SYS_AUTO_ACTIVATION);
		
		$(this.target).trigger('ready', [this.landscape.scenes, this.landscape.scenesIndexed]);
		
		this.triggerIndex(this.landscape.index, this.landscape.scenes, this.landscape.scenes.length);
	};
	proto.registerAudioChannel = function(audio){
		if(!this.audioChannels)
			this.audioChannels = [];
		this.audioChannels.push(audio);
	};
	
	
	// --------------- USER INTERACTIONS
	
	proto.refreshIndex = function(){
		this.landscape.indexFitFromScroll();
	};
	proto.watchIndexRoutine = function(status){
		if(status){
			if(!this.refreshIndexIID)
				this.refreshIndexIID = window.setInterval(this.cbks.refreshIndex, CCV.global.MAGNIFIER_DRAG_REFRESH_INDEX);
		}
		else if(this.refreshIndexIID){
			window.clearTimeout(this.refreshIndexIID);
			this.refreshIndexIID = null;
		}
	};
	
	proto.initInteractions = function(){
		// swipe handling
		this.background.interactive = true;
		this.background
			.on('pointerdown', this.cbks.scrollStart)
			.on('pointerupoutside', this.cbks.scrollEnd)
			.on('pointerup',this.cbks.scrollEnd);
		
		
		// magnifier drag & drop
		this.magnifier.view.interactive = true;
		this.magnifier.view.on('pointerdown', this.cbks.magnifierDragStart)
	};
	
	proto._mgDragStart = function(e){
		var mgCtx = this.cbks.mgCtx;
		
		if(this.cbks.scrollCtx.active)
			return;
		
		// idle timeout - order magnifier when idle
		if(mgCtx.idleTimeoutId){
			window.clearTimeout(mgCtx.idleTimeoutId);
		}
		
		if(!mgCtx.dragTouch){
			mgCtx.active = true;
			mgCtx.dragTouch = this._createTouch(e);
			this.magnifier.view
				.on('pointerup', this.cbks.magnifierDragEnd)
				.on('pointerupoutside', this.cbks.magnifierDragEnd)
				.on('pointermove', this.cbks.magnifierDragMove);
			
			this.watchIndexRoutine(true);
			
			PIXI.ticker.shared.add(this.cbks.magnifierDragScroll);
		}
		else if(!mgCtx.pinchTouch){
			mgCtx.pinchTouch = this._createTouch(e);
			mgCtx.pinchStartScale = this.magnifier.pinchScale;
			mgCtx.pinchStartDelta = this._mgPinchComputeDelta(mgCtx);
		}
	};
	proto._mgDragMove = function(e){
		var mgCtx = this.cbks.mgCtx, delta, pos;
		
		pos = e.data.getLocalPosition(this.application.stage);
		
		// pinch
		if(mgCtx.pinchTouch){
			switch(e.data.identifier) {
				case mgCtx.dragTouch.id:
					mgCtx.dragTouch.copy(pos);
					break;
				case mgCtx.pinchTouch.id:
					mgCtx.pinchTouch.copy(pos);
					break;
				default:
					/*
					// checked use case : three or more touches on magnifier as expected -> clear warning
					KPF.utils.warn('Touch does not correspond to any stored value ; cancel illegal method call', 'Player._mgDragMove', {
						mgCtx: mgCtx,
						dragTouchId: mgCtx.dragTouch.id,
						pinchTouchId: mgCtx.pinchTouch.id,
						currentTouchId: e.data.identifier
					});
					//*/
					return;
			}
			
			delta = this._mgPinchComputeDelta(mgCtx) - mgCtx.pinchStartDelta;
			delta = KPF.utils.clamp(delta, - CCV.global.MAGNIFIER_PINCH_AMP, CCV.global.MAGNIFIER_PINCH_AMP);
			this.magnifier.pinchScale = mgCtx.pinchStartScale + (delta / CCV.global.MAGNIFIER_PINCH_AMP * CCV.global.MAGNIFIER_PINCH_INCREMENT);
		}
		else if(mgCtx.dragTouch && e.data.identifier == mgCtx.dragTouch.id){
			pos.x = KPF.utils.clamp(pos.x, 0, this.size.x);
			pos.y = KPF.utils.clamp(pos.y, 0, this.size.y);
			this.magnifier.pos = pos;
		}
	};
	proto._mgDragEnd = function(){
		if(CCV.global.MAGNIFIER_DRAG_IDLE_TEMPO > 0)
			this.cbks.mgCtx.idleTimeoutId = window.setTimeout(this._mgTidy, CCV.global.MAGNIFIER_DRAG_IDLE_TEMPO);
		this._mgDragReset();
	};
	proto._mgDragReset = function(){
		var mgCtx = this.cbks.mgCtx;
		
		this.magnifier.view
			.off('pointerup', this.cbks.magnifierDragEnd)
			.off('pointerupoutside', this.cbks.magnifierDragEnd)
			.off('pointermove', this.cbks.magnifierDragMove);
		
		mgCtx.active = false;
		mgCtx.dragTouch = null;
		mgCtx.pinchTouch = null;
		mgCtx.pinchStartScale = Number.NaN;
		mgCtx.pinchStartDelta = Number.NaN;
		
		this.watchIndexRoutine(false);
		
		PIXI.ticker.shared.remove(this.cbks.magnifierDragScroll);
	};
	proto._mgDragScroll = function(){
		var pos, coef;
		
		pos = this.magnifier.x;
		
		if(pos < CCV.global.MAGNIFIER_DRAG_SCROLL_LIMIT){
			coef = 1 - (pos / CCV.global.MAGNIFIER_DRAG_SCROLL_LIMIT);
			coef = Math.pow(coef, 2);
		}
		else if(window.innerWidth - pos < CCV.global.MAGNIFIER_DRAG_SCROLL_LIMIT){
			coef = ((window.innerWidth - pos) / CCV.global.MAGNIFIER_DRAG_SCROLL_LIMIT) - 1;
			coef = Math.pow(coef, 2);
			coef *= -1;
		}
		else
			return;
		
		this.landscape.scenesScroll.x += coef * CCV.global.MAGNIFIER_DRAG_SCROLL_INC;
	};
	 
	proto._mgTidy = function(doTransition){
		var p = CCV.player;
		var pos = {
			x: .5 * p.size.x,
			y: .9 * p.size.y
		};
		
		if(doTransition === false){
			p.magnifier.pos = pos;
		}
		else{
			TweenMax.to(p.magnifier, .4, {
				ease: Circ.easeInOut,
				pinchScale: 1,
				x: pos.x,
				y: pos.y
			});
		}
	};
	
	proto._mgPinchComputeDelta = function(mgCtx){
		var delta = new PIXI.Point();
		delta.copy(mgCtx.pinchTouch);
		delta.minus(mgCtx.dragTouch);
		return delta.getLength();
	};
	proto._createTouch = function(touch){
		return Object.assign(touch.data.getLocalPosition(CCV.player.application.stage), { id: touch.data.identifier });
	};
	 
	proto._scrollStart = function(e){
		var scrollCtx = this.cbks.scrollCtx;
		
		if(this.cbks.mgCtx.active)
			return;
		if(scrollCtx.active)
			return;
		
		scrollCtx.active = true;
		scrollCtx.elasticity = CCV.global.SCROLL_ELASTICITY;
		scrollCtx.startX = e.data.getLocalPosition(this.application.stage).x;
		scrollCtx.startScrollPanelX = this.landscape.scenesScroll.x;
		
		this.background.on('pointermove', this.cbks.scrollMove);
		this._scrollMove(e);
		
		this.watchIndexRoutine(true);
		
		PIXI.ticker.shared.add(this.cbks.scrollApply);
	};
	proto._scrollMove = function(e){
		var scrollCtx = this.cbks.scrollCtx;
		
		scrollCtx.scrollTargetX = scrollCtx.startScrollPanelX + (e.data.getLocalPosition(this.application.stage).x - scrollCtx.startX);
		scrollCtx.elasticity = CCV.global.SCROLL_ELASTICITY;
	};
	proto._scrollEnd = function(){
		this.background.off('pointermove', this.cbks.scrollMove);
		this.cbks.scrollCtx.active = false;
		this.landscape.indexFitFromScroll();
	};
	proto._scrollReset = function(){
		var scrollCtx = this.cbks.scrollCtx;
		
		this.background.off('pointermove', this.cbks.scrollMove);
		
		PIXI.ticker.shared.remove(this.cbks.scrollApply);
		
		this.watchIndexRoutine(false);
		
		scrollCtx.active = false;
		scrollCtx.startX = Number.NaN;
		scrollCtx.scrollTargetX = Number.NaN;
		scrollCtx.startScrollPanelX = Number.NaN;
	};
	proto._scrollApply = function(){
		var scrollCtx = this.cbks.scrollCtx;
		var delta;
		
		if(!scrollCtx || isNaN(scrollCtx.scrollTargetX))
			return;
		
		delta = (this.landscape.scenesScroll.x - scrollCtx.scrollTargetX);
		if(!scrollCtx.active && Math.abs(delta) < .5){
			this.landscape.scenesScroll.x -= delta;
			this._scrollReset();
		}
		else{
			this.landscape.scenesScroll.x -= delta * scrollCtx.elasticity;
		}
	};
	
	proto.magnifierDisplayToggle = function(status){
		this.magnifierDisplayStatus = KPF.utils.isbool(status) ? status : !this.magnifierDisplayStatus;
		
		KPF.utils.log('magnifierDisplayStatus: ' + this.magnifierDisplayStatus, 'CCV.app.Player');
		
		if(this.magnifierDisplayStatus){
			this._mgTidy(false);
			TweenMax.to(this.magnifier, CCV.global.MAGNIFIER_APPEAR_TIME, {
				scale: 1,
				ease: Expo.easeIn,
				overwrite: 'all'
			});
		}
		else{
			TweenMax.to(this.magnifier, CCV.global.MAGNIFIER_VANISH_TIME, {
				scale: 0,
				ease: CustomEase.create('custom', 'M0,0,C0.646,-0.888,0.536,0.894,1,1'),
				overwrite: 'all'
			});
		}
		$(this.target).trigger('magnifierDisplayChange', [this.magnifierDisplayStatus]);
	};
	proto.scenesShowFillToggle = function(status){
		status = KPF.utils.isbool(status) ? status : !this.scenesShowFillStatus;
		this.scenesShowFillStatus = status;
		
		KPF.utils.log('scenesShowFillStatus: ' + this.scenesShowFillStatus, 'Player.scenesShowFillToggle')
		
		this.landscape.scenes.forEach(function(scene){
			scene.showFill(status);
		});
		$(this.target).trigger('scenesShowFillChange', [this.scenesShowFillStatus]);
	};
	
	
	// --------------- WINDOW UTILITIES
	
	proto.activateSet = function(status){
		var i, ilen;
		
		if(status){
			KPF.utils.log('Start application rendering', 'Player.activate');
			
			PIXI.ticker.shared.start();
			this.animTicker.start();
			this.application.start();
			
			if(this.sleepCache){
				ilen = this.sleepCache.audios.length;
				KPF.utils.log('\t - launch: ' + ilen + ' audios');
				for(i = 0; i < ilen; i++){
					this.sleepCache.audios[i].start();
				}
			}
		}
		else{
			this.sleepCache = {
				audios: []
			};
			
			KPF.utils.log('Stop application rendering', 'Player.activateSet');
			
			PIXI.ticker.shared.stop();
			this.animTicker.stop();
			this.application.stop();
			
			ilen = this.audioChannels.length;
			for(i = 0; i < ilen; i++){
				if(this.audioChannels[i].pause()){
					this.sleepCache.audios.push(this.audioChannels[i]);
				}
			}
		}
	};
	
	proto.resizeInit = function(){
		var maxAvailHeight;
		
		/*
		maxAvailHeight = window.innerHeight - CCV.global.FOOTER_HEIGHT -CCV.global.HEADER_HEIGHT;
		if(CCV.global.SYS_ALLOW_LARGE && maxAvailHeight > .5 * (CCV.global.SCENE_MAX_HEIGHT + CCV.global.SCENE_GROUND_HEIGHT)){
			this.scaleFolder = 'x2';
			this.scaleSourceCoef = 2;
		}
		else{
			this.scaleFolder = 'x1';
			this.scaleSourceCoef = 1;
		}
		*/
		
		this.scaleFolder = 'x1';
		this.scaleSourceCoef = 1;
		
		CCV.global.SCENE_MAX_HEIGHT *= this.scaleSourceCoef;
		this.landscapeHeight *= this.scaleSourceCoef;
		this.groundHeight *= this.scaleSourceCoef;
		this.mediaFolder = CCV.global.MEDIA_FOLDER + this.scaleFolder + '/';
		KPF.utils.log('scale folder: ' + this.scaleFolder + ', scaleSourceCoef: ' + this.scaleSourceCoef.toFixed(1), 'Player.resizeInit');
	};
	proto.resize = function(){
		var scaleOverflow = false;
		
		this.size = new PIXI.Point(window.innerWidth, window.innerHeight);
		this.size.y -= CCV.global.HEADER_HEIGHT;
		this.size.y -= CCV.global.FOOTER_HEIGHT;
		
		this.background.width = this.size.x;
		this.background.height = this.size.y;
		
		this.scale = this.size.y / (this.landscapeHeight + this.groundHeight);
		if(this.scale > 1){
			scaleOverflow = true;
			this.scale = 1;
		}
		
		this.application.renderer.resize(this.size.x, this.size.y);
		
		KPF.utils.log(
			'\n - application size: ' + this.size.toString()
			+ '\n - application scale: ' + this.scale.toFixed(2)
			+ '\n - scaleOverflow: ' + scaleOverflow,
			'Player.resize'
		);
		
		// magnifier
		this.magnifier.redraw(this.scale);
		this._mgTidy(false); // avoid lost magnifier
		
		
		this.landscape.resize(this.size, this.scale);
	};
	
	 
	// --------------- EVENT HANDLERS
	
	proto.triggerIndex = function(index, scene, scenesLen){
		$(this.target).trigger('sceneIndexChange', [index, scene, scenesLen]);
	};
}


// ###################################################################################################################  PLAYER UTILITIES

// ----------------------------------------------------------------------
// CCV.app.AnimationsTicker
// ----------------------------------------------------------------------
if(!CCV.app.AnimationsTicker){
	
	/**
	 * Global ticker for PIXI animations to provide support for FPS configuration.
	 * @constructor
	 */
	CCV.app.AnimationsTicker = function(){
		this.renderCallback = this.render.bind(this);
		this.renderIntervalId = null;
		this.frameLength = 1000 / CCV.global.SYS_FPS;
		this.running = false;
		 
		/** @var Array.<PIXI.extras.AnimatedSprite> */
		this.sequences = [];
	};
	proto = CCV.app.AnimationsTicker.prototype;
	
	proto.start = function(){
		if(this.running)
			return;
		
		this.running = true;
		this.renderIntervalId = window.setInterval(this.renderCallback, this.frameLength);
		this.render();
	};
	proto.stop = function(){
		if(!this.running)
			this.running = false;
		
		this.running = false;
		window.clearInterval(this.renderIntervalId);
	};
	/**
	 * @param sequence {CCV.app.Sequence}
	 */
	proto.addSequence = function(sequence){
		if(this.sequences.indexOf(sequence) < 0 && sequence.animation.totalFrames > 1) {
			this.sequences.push(sequence);
			return true;
		}
		return false;
	};
	/**
	 * @param sequence {CCV.app.Sequence}
	 */
	proto.removeSequence = function(sequence){
		var i = this.sequences.indexOf(sequence);
		if(i >= 0){
			this.sequences.splice(i, 1);
			return true;
		}
		return false;
	};
	proto.render = function(e){
		for(var i = 0, ilen = this.sequences.length; i < ilen; i++)
			this.sequences[i].nextFrame();
	};
}


// ----------------------------------------------------------------------
// CCV.app.FooterMenu
// ----------------------------------------------------------------------
if(!CCV.app.FooterMenu){
	
	/**
	 * @constructor
	 */
	CCV.app.FooterMenu = function(){
		
		this.buildView();
		
		var app = DGN.app;
		
		this.arrow.on('pointerdown', this.openStatusToggle.bind(this));
		this.magnifier.on('pointerdown', CCV.player.magnifierDisplayToggle.bind(CCV.player));
		if(app){
			this.help.on('pointerdown', app.openHelp.bind(app));
			this.home.on('pointerdown', app.closePlay.bind(app));
		}
		
		this.opened = false;
		this.openStatus(this.opened );
	}
	proto = CCV.app.FooterMenu.prototype;
	
	proto.buildView = function(){
		this.iconSize = 46;
		this.iconMargin = 30;
		
		this.view = new PIXI.Container();
		
		this.innerContainer = new PIXI.Container();
		this.view.addChild(this.innerContainer);
		
		this.home = new PIXI.Sprite.fromImage('theme/mm/_icon-red-home.png');
		this.home.anchor.set(.5);
		this.home.interactive = this.home.buttonMode = true;
		this.home.x = - this.iconSize;
		this.home.width = this.home.height = this.iconSize;
		this.innerContainer.addChild(this.home);
		
		this.magnifier = new PIXI.Sprite.fromImage('theme/mm/_icon-red-magnifier.png');
		this.magnifier.anchor.set(.5);
		this.magnifier.interactive = this.magnifier.buttonMode = true;
		this.magnifier.x = this.home.x - (this.iconSize + this.iconMargin);
		this.magnifier.width = this.magnifier.height = this.iconSize;
		this.innerContainer.addChild(this.magnifier);
		
		this.help = new PIXI.Sprite.fromImage('theme/mm/_icon-red-help.png');
		this.help.anchor.set(.5);
		this.help.interactive = this.help.buttonMode = true;
		this.help.x = this.magnifier.x - (this.iconSize + this.iconMargin);
		this.help.width = this.help.height = this.iconSize;
		this.innerContainer.addChild(this.help);
		
		this.arrow = new PIXI.Sprite.fromImage('theme/mm/_icon-red-to-left.png');
		this.arrow.anchor.set(.5);
		this.arrow.interactive = this.arrow.buttonMode = true;
		this.arrow.x = this.help.x - (this.iconSize + this.iconMargin);
		this.arrow.width = this.arrow.height = this.iconSize;
		this.innerContainer.addChild(this.arrow);
		
		this.mask = new PIXI.Graphics();
		this.mask.beginFill(0x00ff00, .4);
		this.mask.drawRect(this.arrow.x - .5 * this.iconSize, -.5 * this.iconSize, 4 * this.iconSize +  3 * this.iconMargin, this.iconSize);
		this.view.addChild(this.mask);
		this.innerContainer.mask = this.mask;
		
		/*
		this.debug = new PIXI.Graphics();
		CCV.utils.drawDebugPoint(this.debug, new PIXI.Point(0, 0), 0x00ff00, 1);
		this.view.addChild(this.debug);
		*/
	};
	proto.openStatusToggle = function(){
		this.openStatus(!this.opened);
	}
	proto.openStatus = function(status){
		var pos = 0;
		
		this.opened = status;
		
		TweenMax.to(this.arrow, .2, {
			rotation: status ? Math.PI : 0
		});
		TweenMax.to(this.innerContainer, .5, {
			ease: Strong.easeOut,
			x: status ? 0 : - this.iconSize - this.arrow.x
		});
	}
}


// ----------------------------------------------------------------------
// CCV.app.Landscape
// ----------------------------------------------------------------------
if (!CCV.app.Landscape) {
	/**
	 * @constructor
	 * @param data {{scenes:Array}}   data    JSON data holder
	 */
	CCV.app.Landscape = function () {
		
		this.view = new PIXI.Container();
		
		this.scenesCtn = new PIXI.Container();
		this.view.addChild(this.scenesCtn);
		
		this.scenesScroll = new PIXI.Container();
		this.scenesCtn.addChild(this.scenesScroll);
		
		this.ground = new CCV.app.Ground();
		
		this.debugGfx = new PIXI.Graphics();
		this.scenesCtn.addChild(this.debugGfx);
		
		/**
		 * @var {Array.<CCV.app.Scene>}
		 */
		this.scenes = [];
		/**
		 * @var {number}
		 * @private
		 */
		this.index = 0;
		/**
		 * @var {PIXI.Point}
		 * @private
		 */
		this.size = new PIXI.Point();
		/**
		 * @var {Number}
		 * @private
		 */
		this.xCenter = 0;
		
		/*
		var separator = KPF.utils.repeat(80, '#');
		KPF.utils.log(separator + '\n' + this.info() + '\n' + separator);
		// */
	};
	proto = CCV.app.Landscape.prototype;
	
	/**
	 * @param size    {PIXI.Point}
	 * @param scale    {Number}
	 */
	proto.resize = function(size, scale){
		var temp, heightMaxi, pl = CCV.player;
		
		this.scenesCtn.scale = new PIXI.Point(scale, scale);
		
		this.size = size.clone();
		this.size.scale(1 / scale);
		this.size.round();
		
		heightMaxi = CCV.player.landscapeHeight + pl.groundHeight;
		if(this.size.y > heightMaxi){
			this.size.y = heightMaxi;
			this.view.y = Math.round((size.y - this.size.y) * .66);
		}
		else{
			this.view.y = 0;
		}
		
		this.xCenter = Math.round(this.size.x * .5);
		
		// reposition bottom footer
		var gy = this.view.y + (scale * pl.landscapeHeight);
		var dy = CCV.player.size.y - gy;
		var ty = gy + (.5 * dy);
		pl.menu.view.x = size.x - 25;
		pl.menu.view.y = ty;
		
		// graphic debug
		this.debugGfx.clear();
		if(CCV.global.DEBUG_LANDSCAPE_GFX){
			
			temp = .5 * this.size.y;
			this.debugGfx.lineStyle(4, 0x006633, 1);
			this.debugGfx.moveTo(this.xCenter - 20, temp);
			this.debugGfx.lineTo(this.xCenter + 20, temp);
			this.debugGfx.moveTo(this.xCenter, temp - 20);
			this.debugGfx.lineTo(this.xCenter, temp + 20);
			
			/*
			// draw scene area
			this.debugGfx.lineStyle();
			this.debugGfx.beginFill(0xff0000, .05);
			this.debugGfx.drawRect(0, 0, this.size.x, pl.landscapeHeight);
			this.debugGfx.endFill();
			
			// draw ground line
			this.debugGfx.lineStyle();
			this.debugGfx.beginFill(0x0, .05);
			this.debugGfx.drawRect(0, pl.landscapeHeight, this.size.x, pl.groundHeight);
			this.debugGfx.endFill();
			*/
		}
		
		// reset landscape position
		if(this.index >= 0)
			this.setIndex(this.index, true, false);
	};
	proto.toString = function () {
		this.info(0);
	};
	proto.info = function (depth, indentStart) {
		var str = '';
		var ilen = this.scenes.length;
		var pattern = KPF.global.FORMAT_INDENT;
		var indent;
		
		if (isNaN(depth))
			depth = 0;
		
		indent = KPF.utils.repeat(depth, pattern);
		if (indentStart === true)
			str = indent;
		
		str += '[Landscape] (' + ilen + ' scenes)';
		for (var i = 0; i < ilen; ++i)
			str += '\n' + indent + pattern + this.scenes[i].info(depth + 1, false);
		return str;
	};
	/**
	 * Parses JSON data holder.
	 * @param data {{scenes:Array}}   data    JSON data holder
	 */
	proto.parse = function (data) {
		var i, ilen, scene, formerScene, xPos, scenesPositions, yGround;
		 
		// --- parse scenes data
		this.scenes = [];
		this.scenesIndexed = [];
		for (i = 0, ilen = (data.scenes ? data.scenes.length : 0); i < ilen; ++i) {
			scene = new CCV.app.Scene(data.scenes[i], i);
			if(scene.id == '_debug' && !CCV.global.DEBUG_LANDSCAPE_GFX)
				continue;
			if(scene.indexable)
				this.scenesIndexed.push({
					index: this.scenes.length,
					scene: scene
				});
			this.scenes.push(scene);
		}
		
		// add scenes and define scenes positions
		yGround = CCV.player.landscapeHeight;
		
		scenesPositions = [];
		for(i = 0, ilen = this.scenes.length, xPos = 0; i < ilen; ++i) {
			scene = this.scenes[i];
			
			// left position part
			xPos += scene.marginLeft;
			
			// assign position
			scene.view.x = xPos;
			scene.view.y = yGround - scene.size.y;
			
			// store
			scenesPositions.push(xPos);
			
			// right position part
			xPos += scene.size.x + scene.pos.x;
			
			// append scene to view
			this.scenesScroll.addChild(scene.view);
			if(scene.popUnder && formerScene)
				this.scenesScroll.swapChildren(scene.view, formerScene.view);
			formerScene = scene;
		}
		
		// compute scenes widths and remove last utility scene (#_end)
		this.scenesWidths = [];
		for(i = 1, ilen = scenesPositions.length; i < ilen; ++i)
			this.scenesWidths.push(scenesPositions[i] - scenesPositions[i - 1]);
		this.scenes.pop();
		
		this.ground.parse(data.ground);
		this.ground.view.position = new PIXI.Point(0, yGround + this.ground.pos.y);
		this.scenesScroll.addChild(this.ground.view);
		
		// ---   initial position
		this.scenes[0].view.x = this.scenes[0].marginLeft;
		this.reArrangeScenesFrom(0);
	};
	/**
	 * Picks a random indexable scene.
	 * @param doTransition  {Boolean}
	 */
	proto.pickRandomIndex = function(){
		var index, indexFormer;
		
		indexFormer = this.index;
		while(!KPF.utils.isan(index) || indexFormer == index){
			index = KPF.utils.randomInt(0, this.scenes.length - 1);
			if(!this.scenes[index].indexable){
				index = Number.NaN;
			}
		}
		
		KPF.utils.log('index: ' + index, 'CCV.app.Landscape.pickRandomIndex');
		return index;
	};
	proto.setRandomIndex = function(doTransition){
		var index;
		
		index = this.pickRandomIndex();
		doTransition = doTransition !== false;
		
		KPF.utils.log('index: ' + index + ', doTransition: ' + doTransition, 'CCV.app.Landscape.setRandomIndex');
		this.setIndex(index, true, doTransition);
	};
	/**
	 * @param orientation {Number}
	 */
	proto.move = function (orientation, indexedOnly) {
		var newval;
		
		indexedOnly = indexedOnly !== false;
		
		if(indexedOnly){
			for(var i = 0, ilen = this.scenesIndexed.length, beforeScene, afterScene, equalScene; i <= ilen; ++i){
				if(i == ilen || this.scenesIndexed[i].index > this.index){
					afterScene = this.scenesIndexed[i % ilen];
					beforeScene = this.scenesIndexed[(i - 1 + ilen) % ilen];
					if(beforeScene.index == this.index){
						equalScene = beforeScene;
						beforeScene = this.scenesIndexed[(i - 2 + ilen) % ilen];
					}
					break;
				}
			}
			
			/*
			KPF.utils.log(
				'move with orientation: ' + orientation + ', indexedOnly: ' + indexedOnly,
				'Landscape.move', {
					afterScene: afterScene,
					equalScene: equalScene,
					beforeScene: beforeScene
				});
			//*/
			
			if (orientation == 0){
				if(equalScene)
					return;
				newval = (Math.abs(beforeScene.index - this.index) < Math.abs(afterScene.index - this.index)) ? beforeScene.index : afterScene.index;
			}
			else if(orientation < 0)
				newval = beforeScene.index;
			else if(orientation > 0)
				newval = afterScene.index;
		}
		else if( orientation == 0)
			return;
		else
			newval = this.index + (orientation > 0 ? 1 : -1);
		this.setIndex(newval, true, true);
	};
	/**
	 * @param index {Number}
	 * @param doTransition {Boolean}
	 */
	proto.setIndex = function (index, applyPosition, doTransition) {
		
		var i, ilen, activationDelta, activationDeltaMin, activationDeltaMax, activationTest;
		var limitBefore, limitAfter,  limitDelta;
		var sceneBefore, sceneAfter, sceneCurrent;
		
		doTransition = doTransition !== false;
		ilen = this.scenes.length;
		if (ilen == 0) {
			KPF.log('[CCV.app.Landscape.setSceneIndex] Illegal call; scenes is empty');
			return;
		}
		
		// constrain index
		if (index < 0)
			index = ilen - 1;
		else if (index > ilen - 1)
			index = 0;
		index = parseInt(index);
		if(this.index == index){
			return;
		}
			
		this.index = index;
		KPF.utils.log('index: ' + index, 'Landscape.setIndex');
		
		
		// retrieve bording indexed scenes
		scene = this.scenes[this.index];
		for(i = 0, ilen = this.scenesIndexed.length; i <= ilen; ++i){
			if(i == ilen || this.scenesIndexed[i].index > this.index){
				sceneAfter = this.scenesIndexed[i % ilen];
				sceneBefore = this.scenesIndexed[(i - 1 + ilen) % ilen];
				if(sceneBefore.index == this.index){
					sceneCurrent = sceneBefore;
					sceneBefore = this.scenesIndexed[(i - 2 + ilen) % ilen];
				}
				break;
			}
		}
		
		// activate/deactivate scene according to current scene
		KPF.utils.log('activate sequences between ]#' + sceneBefore.scene.id + ', index:' + sceneBefore.index + '; #' + sceneAfter.scene.id + ', index:' + sceneAfter.index + '[', 'Landscape.setIndex')
		
		ilen = this.scenes.length;
		activationDeltaMax = Math.floor(ilen / 2);
		activationDeltaMin = - activationDeltaMax;
		
		for (i = 0; i < ilen; ++i){
			activationDelta = i - this.index;
			if(activationDelta < activationDeltaMin)
				activationDelta += ilen;
			else if(activationDelta > activationDeltaMax)
				activationDelta -= ilen;
			this.scenes[i].activateDisplay(activationDelta, {
					before: sceneBefore,
					after: sceneAfter
				});
		}
		
		// rearrange scenes positions
		this.reArrangeScenesFrom(this.index);
		
		// ---   compute scene amplitude
		limitBefore = sceneBefore.scene.view.x  + sceneBefore.scene.pos.x + sceneBefore.scene.size.x;
		limitAfter = sceneAfter.scene.view.x + sceneAfter.scene.pos.x;
		limitDelta = limitAfter - limitBefore;
		
		this.xTarget = this.xCenter - limitBefore - (.5 * limitDelta);
		this.scrollPreview = CCV.global.SCROLL_PREVIEW_OFFSET;
		
		// scroll position
		if(applyPosition){
			if(doTransition){
				TweenMax.to(this.scenesScroll, CCV.global.SCENE_SLIDE_DURATION, {
					x: this.xTarget,
					ease: Expo.easeInOut
				});
			}
			else
				this.scenesScroll.x = this.xTarget;
		}
		
		CCV.player.triggerIndex(this.index, this.scenes[this.index], this.scenes.length);
	};
	proto.indexFitFromScroll = function(){
		var closestScene,
			ref = this.scenesScroll.x - this.xCenter,
			minDelta = 3000;
		
		for(var i = 0, ilen = this.scenes.length, delta, s; i < ilen; i++){
			s = this.scenes[i];
			
			delta = ref;
			delta -=  -(s.view.x + s.pos.x + (.5 * s.size.x));
			delta = Math.abs(delta);
			
			if(delta < minDelta){
				minDelta = delta;
				closestScene = s;
			}
		}
		
		//KPF.utils.log('[' + closestScene.index + '] #' + closestScene.id, 'Landscape.indexFitFromScroll');
		this.setIndex(closestScene.index, false, true);
		
	};
	/** @private */
	proto.reArrangeScenesFrom = function(index){
		var i, ilen, xPos, clampedIndex;
		
		//console.log('reArrangeScenesFrom: ' + index + ', #' + this.scenes[index].id + ' at: ' + this.scenes[index].view.x);
		
		// ground
		xPos = this.scenes[index].view.x;
		this.ground.view.x = KPF.utils.floorTo(xPos, this.ground.size.x) - this.ground.size.x;
			
		// left-side items
		xPos = this.scenes[index].view.x;
		for(i = 1, ilen = this.scenes.length; i < CCV.global.SCENE_ITEM_BEFORE; ++i) {
			clampedIndex = index - i;
			while (clampedIndex < 0)
				clampedIndex += ilen;
			clampedIndex %= ilen;
			
			xPos -= this.scenesWidths[clampedIndex];
			this.scenes[clampedIndex].view.x = xPos;
		}
		
		// right-side items
		xPos = this.scenes[index].view.x + this.scenesWidths[index];
		for(i = 1, ilen = this.scenes.length; i < ilen - CCV.global.SCENE_ITEM_BEFORE; ++i) {
			clampedIndex = index + i;
			while (clampedIndex < 0)
				clampedIndex += ilen;
			clampedIndex %= ilen;
			
			this.scenes[clampedIndex].view.x = xPos;
			xPos += this.scenesWidths[clampedIndex];
		}
	};
}


// ----------------------------------------------------------------------
// CCV.app.Scene
// ----------------------------------------------------------------------
if (!CCV.app.Scene) {
	/**
	 * @param data {object}   data    JSON data holder
	 * @constructor
	 */
	CCV.app.Scene = function (data, index) {
		var ssc = CCV.player.scaleSourceCoef;
		
		this.index = index;
		
		// --- parse data
		this.id = data.id;
		this.fullId = '[' + this.index + '] ' + data.id;
		
		this.folder = CCV.player.mediaFolder;
		if(this.id.indexOf('_') != 0){
			this.folder += this.id + '/';
		}
		
		this.indexable = data.indexable !== false;
		this.disposable = data.disposable !== false;
		this.popUnder = data.popUnder === true;
		
		this.pos = new PIXI.Point();
		if(data.pos)
			this.pos.copy(data.pos);
		this.pos.scale(ssc);
		
		this.marginLeft = data.marginLeft * ssc;
		
		this.size = new PIXI.Point(data.size.x, data.size.y);
		this.size.scale(ssc);
		this.xCenter = Math.round(.5 * this.size.x);
		
		this.activationTimeoutId = null;
		
		
		// ---   build audio
		if(data.hasOwnProperty('audio')){
			this.audio = new CCV.audio.AudioChannel(data.audio);
		}
		// ---   build view
		this.viewBuild(data);
	};
	proto = CCV.app.Scene.prototype;
	
	proto.toString = function () {
		return this.info(0);
	};
	proto.info = function (depth, indentStart) {
		var str = '';
		var pattern = KPF.global.FORMAT_INDENT;
		var indent;
		
		if (isNaN(depth))
			depth = 0;
		
		indent = KPF.utils.repeat(depth, pattern);
		if (indentStart === true)
			str = indent;
		
		str += '[Scene] #' + this.id;
		if (this.redFill)
			str += '\n' + indent + pattern + 'redFill: ' + this.redFill.info(depth + 1, false);
		/** EDIT 08/05/2017 Useless for adHoc version
		if (this.redOutline)
			str += '\n' + indent + pattern + 'redOutline: ' + this.redOutline.info(depth + 1, false);
		*/
		if (this.blue)
			str += '\n' + indent + pattern + 'blue: ' + this.blue.info(depth + 1, false);
		return str;
	};

	proto.factoryModel = function (data) {
		if (data) {
			if (KPF.utils.isarray(data)){
				return new CCV.app.CompoLayer(data, this);
			}
			else if (data.hasOwnProperty('video'))
				return new CCV.app.VideoLayer(data, this);
			else if (data.hasOwnProperty('seqEnd'))
				return new CCV.app.Sequence(data, this);
			else
				return new CCV.app.Layer(data, this);
		}
		return null;
	};
	proto.showFill = function(status){
		if(!this.redFill)
			return;
		
		TweenMax.to(this.redFill.view, .3, {
			ease: Expo.easeOut,
			alpha: status ? 1 : 0
		});
	};
	proto.viewBuild = function (data) {
		this.view = new PIXI.Container();
		
		// ---   blue layers
		this.blue = this.factoryModel(data.blue);
		if(this.blue && this.blue.view){
			this.blue.view.position.copy(this.pos);
			this.view.addChild(this.blue.view);
		}
		
		// ---   red layers
		this.red = new CCV.app.CompoLayer(data.red, this);
		if(data.red){
			this.redFill = this.red.addLayer(data.red.fill, this);
			if(this.redFill && this.redFill.view){
				this.redFill.view.position.copy(this.pos);
				this.redFill.view.blendMode = PIXI.BLEND_MODES.MULTIPLY;
				this.view.addChild(this.redFill.view);
			}
		}
		
		this.debugGfx = new PIXI.Container();
		
		// ---   debug markers
		if (CCV.global.DEBUG_SCENE_GFX) {
			var debugSceneGfx = new PIXI.Graphics();
			this.debugGfx.addChild(debugSceneGfx);
			
			// draw size and position
			CCV.utils.drawDebugPoint(debugSceneGfx, this.pos, 0xff0000, 2);
			CCV.utils.drawDebugRect(debugSceneGfx, new PIXI.Rectangle(this.pos.x, this.pos.y, this.size.x, this.size.y), 0x0000ff, 1, 1, false);
			this.debugGfx.addChild(debugSceneGfx);
			
			CCV.utils.drawDebugPoint(debugSceneGfx, new PIXI.Point(0, 0), 0xff0000, 2);
			CCV.utils.drawDebugRect(debugSceneGfx, new PIXI.Rectangle(0, 0, Math.abs(this.size.x + this.pos.x), this.size.y + this.pos.y), 0xff0000, 1, .2, false);
		}
		
		// draw left margin
		if(CCV.global.DEBUG_SCENE_MARGINS){
			var debugMarginsGfx = new PIXI.Graphics();
			this.debugGfx.addChild(debugMarginsGfx);
			
			if(this.marginLeft != 0){
				debugMarginsGfx.lineStyle(1, 0x0000ff, 1);
				debugMarginsGfx.drawRect(this.pos.x - this.marginLeft, this.pos.y, this.marginLeft, this.size.y);
				debugMarginsGfx.moveTo(this.pos.x, this.pos.y);
				debugMarginsGfx.lineTo(this.pos.x - this.marginLeft, this.pos.y + (.5 * this.size.y));
				debugMarginsGfx.lineTo(this.pos.x, this.pos.y + this.size.y);
			}
		}
		
		if(CCV.global.DEBUG_SCENE_DELTA) {
			// show root ID and position
			this.text = new PIXI.Text('', {
				fontFamily: 'Verdana',
				fontSize: 24,
				fill: 0x0
			});
			this.text.alpha = .5;
			this.text.position = new PIXI.Point(10 + this.pos.x, 30 + this.pos.y);
			this.debugGfx.addChild(this.text);
		}
			
		if(this.debugGfx.children.length > 0)
			this.view.addChild(this.debugGfx);
		else
			delete this.debugGfx;
	};
	proto.activateDisplay = function(delta, context) {
		var self = this;
		var deltaAbs = Math.abs(delta);
		
		if(CCV.global.DEBUG_SCENE_DELTA)
			this.text.text = '#' + this.id + '\n[' + deltaAbs + ']';
		
		// audio management
		if(this.audio){
			(deltaAbs > CCV.global.PRELOAD_AUDIO_DELTA) ? this.audio.destroy() : this.audio.init();
			status && CCV.global.AUDIO_ENABLED ? this.audio.start(true) : this.audio.stop(true);
		}
		
		$(self).trigger('displayStateChange', [delta, context]);
	};
}


// ----------------------------------------------------------------------
// CCV.app.CompoLayer
// ----------------------------------------------------------------------
if (!CCV.app.CompoLayer) {
	
	/**
	 * Composite layer model.
	 * @param data    object   JSON formatted data holder
	 * @param scene   CCV.app.Scene   context scene
	 * @constructor
	 */
	CCV.app.CompoLayer = function (data, scene) {
		this.layers = [];
		
		if(!data)
			return;
		
		this.view = new PIXI.Container();
		
		for (var i = 0, ilen = data.length; i < ilen; ++i)
			this.addLayer(data[i], scene);
	};
	proto = CCV.app.CompoLayer.prototype;
	
	proto.addLayer = function(data, scene){
		var layer = scene.factoryModel(data);
		this.view.addChild(layer.view);
		return layer;
	};
	proto.toString = function () {
		return this.info(0);
	};
	proto.info = function (depth, indentStart) {
		var str;
		var pattern = KPF.global.FORMAT_INDENT;
		var indent;
		var ilen = this.layers.length;
		
		if (isNaN(depth))
			depth = 0;
		
		indent = KPF.utils.repeat(depth, pattern);
		
		str = (indentStart === true) ? indent : '';
		str += '[CompoLayer] ' + ilen + ' layers';
		for (var i = 0; i < ilen; ++i)
			str += '\n' + this.layers[i].info(depth + 1, true);
		return str;
	}
}


// ----------------------------------------------------------------------
// CCV.app.Layer
// ----------------------------------------------------------------------
if (!CCV.app.Layer) {
	/**
	 * Single frame layer model.
	 *
	 * @param data    Object  JSON formatted data holder
	 * @param scene   CCV.app.Scene   context scene
	 * @constructor
	 */
	CCV.app.Layer = function (data, scene) {
		this.file = scene.folder + data.file;
		this.scene = scene;
		this.view = new PIXI.Container();
		this.img = null;
		
		$(this.scene).on('displayStateChange', this.activateDisplay.bind(this));
	};
	proto = CCV.app.Layer.prototype;
	
	proto.activateDisplay = function(e, delta, context){
		if(Math.abs(delta) < CCV.global.PRELOAD_LAYER_DELTA){
			if(this.img)
				return;
			
			this.img = PIXI.Sprite.fromImage(this.file);
			this.img.blendMode = PIXI.BLEND_MODES.MULTIPLY;
			this.view.addChild(this.img);
			
			// console.log('\t - create ' + (this.scene ? this.scene.fullId : '"' + this.file + '"') + ' layer');
			
			CCV.player.texturesCounter++;
		}
		else if(this.img){
			this.view.removeChildren();
			this.img.destroy(true);
			this.img = null;
			
			// console.log('\t - destroy ' + (this.scene ? this.scene.fullId : '"' + this.file + '"') + ' layer');
			
			CCV.player.texturesCounter--;
		}
	};
	/**
	 * Returns a string representation of the instance
	 * @return {string}
	 */
	proto.toString = function () {
		return this.info(0);
	};
	/**
	 * Returns a formatted string representation of the instance
	 * @param depth   Number   formatting depth
	 * @param indentStart   Boolean   whether or not indentation should be added on string start
	 * @return {string}
	 */
	proto.info = function (depth, indentStart) {
		var pattern = KPF.global.FORMAT_INDENT;
		var str;
		
		str = (indentStart === true) ? KPF.utils.repeat(depth || 0, pattern) : '';
		str += '[Layer] file: "' + this.file + '"';
		return str;
	}
}


// ----------------------------------------------------------------------
// CCV.app.Sequence
// ----------------------------------------------------------------------
if (!CCV.app.Sequence) {
	/**
	 * Multiple frame layer model.
	 * @param data    object   JSON formatted data holder
	 * @param scene   CCV.app.Scene   context scene
	 * @constructor
	 */
	CCV.app.Sequence = function (data, scene) {
		this.scene = scene;
		
		this.parse(data);
		
		this.pos = new PIXI.Point(0, 0);
		if(data.pos)
			this.pos.copy(data.pos);
		
		this.view = new PIXI.Container();
		this.view.x = this.pos.x;
		this.view.y = this.pos.y;
		
		if(data.hasOwnProperty('preview')) {
			this.previewSrc = this.scene.folder + data.preview;
		}
		
		// ---   debug markers
		if (CCV.global.DEBUG_SCENE_GFX) {
			this.text = new PIXI.Text('', {
				fontFamily: 'Verdana',
				fontSize: 15,
				fill: 0x0
			});
			this.text.position = new PIXI.Point(20, -20);
			this.view.addChild(this.text);
		}
		
		$(this.scene).on('displayStateChange', this.activateDisplay.bind(this));
	};
	proto = CCV.app.Sequence.prototype;
	
	proto.parse = function(data){
		this.spritesheet = data.spritesheet === true;
		this.loader = null;
		this.seqNumLength = data.hasOwnProperty('seqNumLength') ? data.seqNumLength : -1;
		this.seqStart = data.hasOwnProperty('seqStart') ? data.seqStart : 1;
		this.seqEnd = data.hasOwnProperty('seqEnd') ? data.seqEnd : 1;
		
		this.endDelay = (data.hasOwnProperty('endDelay') && data.endDelay >= 0) ? data.endDelay : CCV.global.SCENE_REPEAT_DELAY;
		this.endFrames = parseInt(this.endDelay / 1000 * CCV.global.SYS_FPS);
		this.endSuspensionFrames = -1;
		
		this.startDelay = (data.hasOwnProperty('startDelay') && data.startDelay >= 0) ? data.startDelay : CCV.global.SCENE_RESTART_DELAY;
		this.startFrames = parseInt(this.startDelay / 1000 * CCV.global.SYS_FPS);
		this.startSuspensionFrames = -1;
		
		if(data.hasOwnProperty('audio')){
			this.audio = new CCV.audio.AudioChannel(data.audio, true);
		}
		
		this.file = data.file;
		this.loop = data.loop !== false;
	};
	proto.nextFrame = function(){
		var a = this.animation;
		
		if(!a)
			return;
		
		var c = a.currentFrame + 1;
		var t = a.totalFrames;
		
		// ##################### if repeat suspensions frames are defined, handle them
		// ... wait
		if(this.endSuspensionFrames > 0) {
			this.endSuspensionFrames--;
		}
		// ... repeat
		else if(this.endSuspensionFrames == 0) {
			this.endSuspensionFrames = -1;
			if(this.startFrames > 0)
				this.startSuspensionFrames = this.startFrames;
			else if(this.audio){
				KPF.utils.log('launch audio from repeat pause');
				this.audio.start(true);
			}
			a.gotoAndStop(0);
		}
		
		// ##################### if restart suspensions frames are defined, handle them
		// ... wait
		else if(this.startSuspensionFrames > 0) {
			this.startSuspensionFrames--;
		}
		// ... restart
		else if(this.startSuspensionFrames == 0) {
			this.startSuspensionFrames = -1;
			a.gotoAndStop(1);
			if(this.audio){
				KPF.utils.log('launch audio from restart pause');
				this.audio.start(true);
			}
		}
		// // ##################### else set playhead to move forward
		else if(c < t){
			a.gotoAndStop(c);
		}
		else{
			if(this.audio)
				this.audio.stop(true);
			
			// sequence has a repeat pause
			if(this.endFrames > 0){
				this.endSuspensionFrames = this.endFrames;
				a.gotoAndStop(t - 1);
			}
			// sequence has a restart pause
			else if(this.startFrames > 0){
				this.startSuspensionFrames = this.startFrames;
				a.gotoAndStop(0);
			}
			//
			else{
				a.gotoAndStop(0);
				if(this.audio){
					KPF.utils.log('launch audio from loop');
					this.audio.start(true);
				}
			}
		}
		
		if (CCV.global.DEBUG_SCENE_GFX) {
			var log = a.currentFrame + '/' + a.totalFrames;
			if(this.startFrames > 0)
				log += ' [restart: ' + this.startSuspensionFrames + '/' + this.startFrames + ']';
			if(this.endFrames > 0)
				log += ' [repeat: ' + this.endSuspensionFrames + '/' + this.endFrames + ']';
			this.text.text = log;
		}
	};
	proto.toString = function () {
		return this.info(0);
	};
	proto.info = function (depth, indentStart) {
		var str;
		
		str = (indentStart === true) ? KPF.utils.repeat(depth || 0, KPF.global.FORMAT_INDENT) : '';
		str += '[Sequence] ' + (this.seqEnd - this.seqStart) + ' frames [' + this.seqStart + ' -> ' + this.seqEnd + ']';
		return str;
	};
	proto.activateDisplay = function(e, delta, context){
		var deltaAbs;
		
		deltaAbs = Math.abs(delta);
		 
		// #################### handle audio preload
		if(this.audio && CCV.global.AUDIO_ENABLED){
			deltaAbs < CCV.global.PRELOAD_AUDIO_DELTA ? this.audio.init() : this.audio.destroy();
		}
		
		// #################### handle preview preload
		if(this.previewSrc) {
			if (deltaAbs < CCV.global.PRELOAD_LAYER_DELTA) {
				if(!this.preview){
					this.preview = new PIXI.Sprite(new PIXI.Texture.fromImage(this.previewSrc));
					this.view.addChild(this.preview);
					CCV.player.texturesCounter++;
					KPF.utils.log('\t\t create ' + this.scene.fullId + ' preview');
				}
			}
			else if (this.preview) {
				this.view.removeChild(this.preview);
				this.preview.destroy(true);
				this.preview = null;
				CCV.player.texturesCounter--;
				KPF.utils.log('\t\t destroy ' + this.scene.fullId + ' preview');
			}
		}
		
		// #################### handle sequence preload
		if(deltaAbs < (this.previewSrc == null ? CCV.global.PRELOAD_LAYER_DELTA : CCV.global.PRELOAD_SEQUENCE_DELTA)){
			if(!this.animation){
				this.buildTextures();
			}
		}
		else{
			if(this.animation == null)
				return;
			
			// remove from animation ticker
			if(CCV.player.animTicker.removeSequence(this)){
				KPF.utils.log('\t\t remove ' + this.scene.fullId + ' ticker');
				
				if(this.audio && CCV.global.AUDIO_ENABLED)
					this.audio.stop(true);
			}
			
			// destroy animation
			CCV.player.texturesCounter -= this.animation.totalFrames;
			this.view.removeChild(this.animation);
				if(!this.spritesheet)
					this.animation.destroy(true);
			this.animation = null;
			
			KPF.utils.log('\t\t destroy ' + this.scene.fullId + ' sequence');
		}
	};
	proto.buildTextures = function(){
		var i, ilen, textures, file, index;
		
		// retrieve files names
		files = [];
		for (i = this.seqStart; i <= this.seqEnd; ++i) {
			index = this.seqNumLength > 0 ? KPF.utils.fillTo(i, this.seqNumLength, '0') : i;
			file = this.file.replace('[NUM]', index);
			files.push(this.file.replace('[NUM]', index));
		}
		
		// store textures
		textures = [];
		ilen = files.length;
		if(this.spritesheet) {
			for(i = 0; i < ilen; i++)
				textures.push(PIXI.Texture.fromFrame(files[i]));
		}
		else{
			for(i = 0; i < ilen; i++)
				textures.push(new PIXI.Texture.fromImage(this.scene.folder + files[i]));
		}
		CCV.player.texturesCounter += textures.length;
		
		// assign textures
		this.animation = new PIXI.extras.AnimatedSprite(textures, false);
		this.animation.gotoAndStop(0);
		this.view.addChild(this.animation);
		
		
		try{
			if(CCV.player.animTicker.addSequence(this)){
				this.startSuspensionFrames = -1;
				this.endSuspensionFrames = -1;
				KPF.utils.log('\t\t launch ' + this.scene.fullId + ' ticker');
				
				if(this.audio && CCV.global.AUDIO_ENABLED)
					this.audio.start(true);
			}
			else{
				console.log('unable to add sequence for ' + this.scene.fullId);
			}
		}
		catch(err){
			KPF.utils.warn('\t\t [failed] launch ' + this.scene.fullId + ' ticker: ' + err.message);
		}
	};
}


// ----------------------------------------------------------------------
// CCV.app.Ground
// ----------------------------------------------------------------------
if (!CCV.app.Ground){
	
	/**
	 * Ground line model.
	 * @param data    object   JSON formatted data holder
	 * @constructor
	 */
	CCV.app.Ground = function (data) {
		this.view = new PIXI.Container();
	};
	proto = CCV.app.Ground.prototype;
	
	proto.parse = function(data){
		this.pos = new PIXI.Point(data.pos.x, data.pos.y);
		this.pos.scale(CCV.player.scaleSourceCoef);
		
		this.size = new PIXI.Point(data.size.x, data.size.y);
		this.size.scale(CCV.player.scaleSourceCoef);
		
		for(var i = 0, texture = PIXI.Texture.fromImage(CCV.player.mediaFolder + data.file); i < 3; ++i){
			gfx = PIXI.Sprite.from(texture);
			gfx.blendMode = PIXI.BLEND_MODES.MULTIPLY;
			gfx.position = new PIXI.Point(i * this.size.x, 0);
			this.view.addChild(gfx);
		}
	}
}


// ----------------------------------------------------------------------
// CCV.app.Magnifier
// ----------------------------------------------------------------------
if(!CCV.app.Magnifier){
	/**
	 * @param radius           {Number} magnifier radius
	 * @constructor
	 */
	CCV.app.Magnifier = function(radius){
		this.radius = radius;
		
		this.view = new PIXI.Container();
		
		this.gfx = new PIXI.Graphics();
		this.gfx.blendMode = PIXI.BLEND_MODES.MULTIPLY;
		this.gfx.scale = new PIXI.Point(1, 1);
		this.view.addChild(this.gfx);
		
		/**
		 * @type {number}
		 * @private
		 */
		this._scale = 0;
		/**
		 * @type {number}
		 * @private
		 */
		this._x = 0;
		/**
		 * @type {number}
		 * @private
		 */
		this._y = 0;
		
		Object.defineProperty(this, 'pinchScale', {
			get: function(){
				return this.gfx.scale ? this.gfx.scale.x : 1;
			},
			set: function(pinchScale){
				pinchScale = KPF.utils.clamp(pinchScale, 1, 1 + CCV.global.MAGNIFIER_PINCH_INCREMENT);
				this.gfx.scale = new PIXI.Point(pinchScale, pinchScale);
			}
		});
		Object.defineProperty(this, 'scale', {
			get: function(){
				return this.view.scale.x;
			},
			set: function(scale){
				this._scale = scale;
				this._render();
			}
		});
		Object.defineProperty(this, 'x', {
			get: function(){
				return this._x;
			},
			set: function(x){
				this._x = x;
				this._render();
			}
		});
		Object.defineProperty(this, 'y', {
			get: function(){
				return this._y;
			},
			set: function(y){
				this._y = y;
				this._render();
			}
		});
		Object.defineProperty(this, 'pos', {
			get: function(){
				return {
					x: this._x,
					y: this._y
				};
			},
			set: function(pos){
				this._x = pos.x;
				this._y = pos.y;
				this._render();
			}
		});
		this.scale = 0;
	};
	proto = CCV.app.Magnifier.prototype;
	
	proto.redraw = function(scale){
		this.gfx.clear();
		this.gfx.beginFill(CCV.global.MAGNIFIER_RED);
		this.gfx.drawCircle(0, 0, this.radius * CCV.player.scaleSourceCoef * scale);
		this.gfx.endFill();
	};
	/** @private */
	proto._render = function(){
		var pos = new PIXI.Point(this._x, this._y);
		pos.to(this.view);
		this.view.scale.copy({ x: this._scale, y: this._scale });
	}
}
