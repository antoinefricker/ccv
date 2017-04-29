var DGN;
var proto;

DGN = {};

DGN.states = {
	HOME: 'home',
	INFO: 'info',
	HELP: 'help',
	PLAY: 'play'
};

DGN.Application = function (lang) {
	StateMachine.create({
		target: DGN.Application.prototype,
		initial: 'none',
		error: function (eventName, from, to, args, errorCode, errorMessage, originalException) {
			console.log('[StateMachine - DGN.sm] event "' + eventName + '" ; ' + errorMessage);
			if(originalException)
			console.warn(originalException);
		},
		events: [
			{name: 'initialize', from: 'none', to: DGN.states.HOME},
			{name: 'openInfo', from: DGN.states.HOME, to: DGN.states.INFO},
			{name: 'closeInfo', from: DGN.states.INFO, to: DGN.states.HOME},
			{name: 'openHelp', from: [DGN.states.HOME, DGN.states.PLAY], to: DGN.states.HELP},
			{name: 'openPlay', from: DGN.states.HELP, to: DGN.states.PLAY},
			{name: 'closePlay', from: DGN.states.PLAY, to: DGN.states.HOME}
		]
	});
	
	this.cnv = document.getElementById('pixi-stage');
	
	/** @var {CCV.core.Player} */
	if(CCV.player)
		this.player = CCV.player;
	else{
		this.player = CCV.player = new CCV.app.Player(this.cnv, {
				magnifierDisplayStatus: false,
				scenesShowFillStatus: true
			});
	}
	
	/** @var {TimelineMax} */
	this.helpAnimation = null;
	
	/** @var {Number} */
	this.infoIndex = 0;
	
	/** @var {Boolean} */
	this.helpResizedFlag = true;
	
	this.behave();
	this.langSet(lang);
	
	/** @var {Howl} */
	this.soundInterface  = null;
};
proto = DGN.Application.prototype;



// ------------------------------------------------------------------------------------------
//         INITIALIZATION & DATA
// ------------------------------------------------------------------------------------------

proto.behave = function(){
	var self = this, page, pagination;
	
	// ---   application
	
	// buttons interactions
	$('[data-lang]')
		.on('click', function () {
			self.langSet($(this).data('lang'));
		});
	
	
	// ---   home page
	
	// buttons interactions
	$('#home')
		.on('click', 'button.action-info', function () {
			self.openInfo();
		})
		.on('click', 'button.action-play', function () {
			self.openHelp();
		})
		.on('click', '.app-title', function () {
			self.openHelp();
		});
	
	
	// ---   help
	
	// buttons interactions
	$('#help')
		.on('click', 'button.action-close', function () {
			self.openPlay();
		});
	
	
	// ---   info
	
	page = $('#info');
	pagination = page.find('.pagination');
	
	// buttons interactions
	page.on('click', 'button.action-home', function () {
		self.closeInfo();
	});
	
	// pagination
	pointer = page.find('.inner-page');
	pointer.each(function (index, el) {
		
		// create items
		$('<div />')
			.on('click', function () {
				self.setInfoIndex(index);
			})
			.appendTo(pagination);
		
		// handle swipe
		$(el).swipe({
			swipe: function (e, direction) {
				if (direction == 'right')
					self.incInfoIndex(-1);
				else if(direction == 'left')
					self.incInfoIndex(1);
			},
			threshold: 50
		});
	});
	
	
	// ---   play
	
	// buttons actions
	pointer = $('#play .footer-menu');
	pointer
		.on('click', '.red-home', function () {
			self.closePlay();
		})
		.on('click', '.red-magnifier', function () {
			self.player.magnifierDisplayToggle();
		})
		.on('click', '.red-help', function () {
			self.helpOpen();
		})
		.on('click', '.red-arrow', function () {
			pointer.toggleClass('opened');
		});
};
proto.toString = function(){
	return '[DGNApplication] lang: ' + this.lang + ', state: "' + this.current + '"';
};




// ------------------------------------------------------------------------------------------
//         STATE MACHINE & PAGES
// ------------------------------------------------------------------------------------------

proto.onenterstate = function(e, from, to){
	if(KPF.PRODUCTION)
		return;
	
	switch(to){
		case DGN.states.HOME:
		case DGN.states.INFO:
			this._soundPlay({
				src: 'ccv/audio/interface.mp3',
				loop: false
			});
			break;
			
		case DGN.states.PLAY:
		case DGN.states.HELP:
			this._soundPlay({
				src: 'ccv/audio/landscape.mp3',
				loop: true
			});
			break;
	}
	
	console.log('----------------------------------------------------------------------------------------------------');
	console.log('Change state from: "' + from + '" to: "' + to + '" [event: "' + e + '"]', 'Application.onenterstate');
	console.log('----------------------------------------------------------------------------------------------------');
};

proto._soundPlay = function(props){
	if(!props || !props.hasOwnProperty('src'))
		return;
	
	if(this.soundInterface){
		if(this.soundInterface._src == props.src)
			return;
		this.soundInterface.fade(this.soundInterface.volume(), 0, 2000);
	}
	
	this.soundInterface = new Howl(Object.assign({
		src: 'ccv/audio/interface.mp3',
		volume: 0,
		buffer: false,
		loop: true,
		autoplay: true,
		onplay: function(){
			this.fade(0, CCV.global.AUDIO_GLOBAL_VOLUME, 8000);
		}
	}, props));
};

proto.oninitialize = function (e, from, to) {
	$('#home').css({
		display: "block"
	});
};
	
proto.onopenInfo = function (e, from, to) {
	this.setInfoIndex(0);
	
	TweenMax.to($('#info'), .3, {
		ease: Circ.easeInOut,
		immediateRender: true,
		startAt: {
			display: 'block',
			transform: 'translateY(-100vh)'
		},
		transform: 'translateY(0)'
	});
};
proto.oncloseInfo = function (e, from, to) {
	$('#home').css({
		display: 'block'
	});
	TweenMax.to($('#info'), .3, {
		ease: Circ.easeInOut,
		immediateRender: true,
		transform: 'translateY(-100vh)'
	});
};
proto.incInfoIndex = function (increment) {
	this.setInfoIndex(this.infoIndex + increment, true);
};
proto.setInfoIndex = function (index, doTransition) {
	var page, pointer, val, self = this;
	
	doTransition === true;
	
	this.infoIndex = KPF.utils.clamp(index, 0, 2) || 0;
	KPF.utils.log('infoIndex: ' + this.infoIndex, 'Application.setInfoIndex');
	
	page = $('#info');
	page.find('.pagination').children().each(function (index, el) {
		$(el).toggleClass('current', index == self.infoIndex);
	});
	
	pointer = page.find('.inner-pages');
	val = 'translateX(' + (-100 * this.infoIndex) + 'vw)';
	
	if(doTransition){
		TweenMax.to(page.find('.inner-pages'), .4, {
			startAt: {
				transform: pointer.css('transform')
			},
			ease: Circ.easeInOut,
			transform: val
		});
	}
	else{
		 pointer.css({
			 transform: val
		 });
	}
};

proto.onopenHelp = function (e, from, to) {
	if (this.helpResizedFlag) {
		window.setTimeout(this._helpBuild.bind(this), 250);
		$('#help').find('.hand').css('opacity', 0.01);
		return;
	}
	this._helpLaunch();
};
proto._helpLaunch = function(){
	this.helpAnimation.restart();
	
	TweenMax.to($('#help'), .3, {
		ease: Circ.easeInOut,
		immediateRender: true,
		startAt: {
			display: 'block',
			transform: 'translateY(100vh)'
		},
		transform: 'translateY(0)',
		onComplete: function(){
			$('#home').css({
				display: 'none'
			})
		}
	});
};
proto._helpBuild = function(){
	var anim, hand, bg;
	var animSize, handSize, bgSize;
	var startX, endX;
	
	
	KPF.utils.log('[Application._helpBuild]');
	
	this.helpAnimation = new TimelineMax({
		repeat: -1,
		repeatDelay: 1.5
	});
	
	// --- show hands
	if(this.current != DGN.HELP){
		$('#help')
			.css({
				display: 'block',
				transform: 'translateY(100vh)'
			})
			.find('.hand').css('opacity', 1);
	}
	
	// ---   animation #1
	
	anim = $('#help-animation1');
	hand = anim.find('.hand');
	bg = anim.find('.background');
	
	animSize = anim.width();
	handSize = hand.width();
	bgSize = bg.width();
	
	startX = (.5 * animSize) - (.2 * bgSize) - (.77 * handSize);
	endX = startX - (.1 * bgSize);
	console.log(animSize, handSize, bgSize);
	
	TweenMax.set(hand, {
		x: endX
	});
	
	// search magnifier
	this.helpAnimation.add(new TweenMax(hand, 1.5, {
		ease: Power1.easeInOut,
		x: startX
	}));
	// move away
	this.helpAnimation.add(new TweenMax(hand, 1.5, {
		ease: Power1.easeInOut,
		x: endX
	}), "+=.5");

/* animation #2 */

	anim = $('#help-animation2');
	hand = anim.find('.hand');
	bg = anim.find('.background');
	
	animSize = anim.width();
	handSize = hand.width();
	bgSize = bg.width();
	
	startX = (.5 * animSize) - ((.5 - .64) * bgSize) - (.05 * handSize);
	startXPrime = startX - (.01 * handSize);
	endX = startX + (.1 * bgSize);
	
	
	TweenMax.set(hand, {
		x: endX
	});
	
	// move to button
	this.helpAnimation.add(TweenMax.to(hand, 2, {
		ease: Power1.easeInOut,
		x: startX
	}), "+=2");
	// click
	this.helpAnimation.add(TweenMax.to(hand, .2, {
		ease: Power1.easeInOut,
		y: 10,
		x: startXPrime
	}));
	// release
	this.helpAnimation.add(TweenMax.to(hand, .2, {
		ease: Power1.easeInOut,
		y: 0,
		x: startX
	}), "+=.2");
	// move away
	this.helpAnimation.add(TweenMax.to(hand, 2, {
		ease: Power1.easeInOut,
		x: endX
	}), "+=.5");
	
	
	this.helpResizedFlag = false;
	this._helpLaunch();
};

proto.onopenPlay = function (e, from, to) {
	var self = this;
	
	if(from == DGN.states.HELP) {
		this.helpAnimation.stop();
		
		TweenMax.to($('#help'), 1, {
			ease: Circ.easeInOut,
			immediateRender: true,
			transform: 'translateY(100vh)',
			onComplete: function(){
				self.player.activate(true);
			}
		});
	}
	
	$('#play').css({
		display: 'block'
	});
	
};
proto.onclosePlay = function (e, from, to) {
	this.player.activate(false);
	
	$('#play').css({
		display: 'none'
	});
	$('#help').css({
		display: 'none'
	});
	
	$('#home').css({
		display: 'block'
	});
};



// ------------------------------------------------------------------------------------------
//          LANGUAGE
// ------------------------------------------------------------------------------------------

/**
 * Defines application language
 * @param lang {String}
 */
proto.langSet = function (lang) {
	if (!lang)
		lang = this.langGetFull();
	else if (lang != 'fr' && lang != 'en')
		lang = 'en';
	this.lang = lang;
	KPF.utils.log('Set application language: ' + this.lang, 'Application.langSet');
	
	$('[data-lang-toggler]').each(function (index, el) {
		$(el).attr('data-lang-toggler', lang);
	});
	
	var isfr = (this.lang == 'fr');
	$('.lang-fr').toggle(isfr);
	$('.lang-en').toggle(!isfr);
};
/**
 * Returns preferred language w/ fallback to browser language
 * @return {String}
 * @private
 */
proto.langGetFull = function () {
	var lang;
	lang = window.navigator.languages ? window.navigator.languages[0] : null;
	lang = lang || window.navigator.language || window.navigator.browserLanguage || window.navigator.userLanguage;
	return this.langCleanResults(lang);
};
/**
 * Returns browser native language
 * @return {String}
 * @private
 */
proto.langGetNative = function () {
	return this.langCleanResults(window.navigator.language || window.navigator.browserLanguage || window.navigator.userLanguage);
};
/**
 * Cleans language results and return language nick (fr, en, etc.)
 * @return {String}
 * @private
 */
proto.langCleanResults = function (v) {
	if (v.indexOf('-') !== -1)
		v = v.split('-')[0];
	if (v.indexOf('_') !== -1)
		v = v.split('_')[0];
	return v;
};


// ------------------------------------------------------------------------------------------
//          GARBAGE CODE
// ------------------------------------------------------------------------------------------

// state machine computed methods - autofill halpers
proto.initialize = function(){};
proto.openInfo = function(){};
proto.closeInfo = function(){};
proto.openHelp = function(){};
proto.openPlay = function(){};
proto.closePlay = function(){};