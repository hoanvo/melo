/* Browser Support: 
**Desktop
Chrome: (Current - 1) and Current
Edge: (Current - 1) and Current
Firefox: (Current - 1) and Current
Internet Explorer: 9+
Safari: (Current - 1) and Current
Opera: Current 

**Mobile
Stock browser on Android 4.0+
Safari on iOS 7+
*/

var num_white_keys = 52;
var num_black_keys = 36;
var color_white_keys = 'transparent';
var color_black_keys = 'transparent';
var keyHeight = 90;
var whiteKeyWidth = 16;
var whiteKeyHeight = 71;
var blackKeyWidth = 10;
var blackKeyHeight = 44;
var keyColors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'tan', 'brown', 'pink', 'springgreen ', 'teal'];
//var channelColors = ['violet', 'white', 'tan', 'brown', 'pink', 'springgreen', 'teal', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red', 'violet', 'tan', 'brown', 'pink'];
var channelColors = [{b: '#5AA817', w: '#9DF05B'}, {b: '#3971B4', w: '#78AAE0'}];
var showNoteLabels = false;
var styleColor = 'channel';

var partialSFSrc = 'script/js/soundfont/';
var partialMidiSrc = 'raw/';
var sounds = []
var mainVolume = .75; // {min: 0, max: 1}
var speed = 0;
//var maxDurationKey = 20000;
var maxDurationKey = 7000;

$(document).ready(function(){    
	
    $('#spaceNotes').attr('width', $('#kpiano').width());
    $('#spaceNotes').attr('height', $('#kpiano').height());

    $('#rdbOn').prop('checked', showNoteLabels);
    $('#rdbOff').prop('checked', !showNoteLabels);
    
    var colorByName = styleColor === 'channel';
    $('#rdbName').prop('checked', colorByName);
    $('#rdbChannel').prop('checked', !colorByName);
    
    $('#volume').val(mainVolume * 100);
    
    initialLocationPiano();
    
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    if (window.AudioContext) {
		ac = new window.AudioContext();      
	}   
    
    loadSoundFont(partialSFSrc + $('#sltSF').val() + '.js');        
    
    midi = new MidiPlayer();
    
    midi.src(partialMidiSrc + $('#sltMidi').val());
    
    function computeSpacePiano() {
        var unit = -120;
        visibleSpaceHeight = {min: 0, max: parseInt($('#spaceNotes').css('height')) - (keyHeight - 15)};
        intervalSpace = {min: unit * midi.durationInSecond(), max: visibleSpaceHeight.max};
        displayedSpace = {min: -visibleSpaceHeight.max + (6 * unit), max:  intervalSpace.max + keyHeight};        
        mapNotes = [];
        mapLines = [];
        midi.timelines.forEach( function(e, idx) {
            var pos = positions[e.event.value.note - 21];
            console.log("11333:", e.event.channel);
            console.log("11:", channelColors[e.event.channel - 1]);
            var color = styleColor === 'channel' ?  channelColors[e.event.channel - 1] : keyColors[(e.event.value.note - 21) % keyColors.length];  
            console.log("collll:", color);         
            var scaleStart = scaleValueInRange(e.start / midi.duration, intervalSpace.min, intervalSpace.max);
			var scaleEnd = scaleValueInRange(e.end / midi.duration, intervalSpace.min, intervalSpace.max);
			//var t = Math.round(intervalSpace.max - (scaleEnd - intervalSpace.min));            
            var r = intervalSpace.max - (scaleStart - intervalSpace.min);            
			var h = scaleEnd - scaleStart;
            var t = r - h;
            mapNotes.push({top: t, left: pos.left, width: pos.type == 'w' ? 16 : 10, height: h, color: pos.type == 'w' ? color.w : color.b, 
                note: e.event.value.note, channel: e.event.channel, velocity: e.event.value.velocity});
                     
        });
        
        midi.timeSigs.forEach( function(e, idx) {
            var scale = scaleValueInRange(e / midi.duration, intervalSpace.min, intervalSpace.max);
            var r = intervalSpace.max - (scale - intervalSpace.min);
            mapLines.push(r);
        });
        
        actMapNotes = $.extend(true, [], mapNotes);
        actMapLines = $.extend(true, [], mapLines);
        
    }
    
    function changeColorNotes() { 
        actMapNotes.forEach(function(e, idx){
            var color = styleColor === 'channel' ? channelColors[e.channel - 1]: keyColors[(e.note - 21) % keyColors.length]; 
            e.color = color;
        });
    }
    
    function canTransposeMidi() {
        var min = -12;
        var max = 12;
        for( var i = 0; i < actMapNotes.length; i++) {
            var e = actMapNotes[i];
            
            if(max === 12) {
                for (var j = 1; j <= 12; j++) {
                    var note = e.note + j;
                    if (note < 21 || note > 108) {                
                        max = j - 1
                        break;
                    }
                }
            }
            
            if(min === -12) {
                for (var j = -1; j >= -12; j--) {
                    var note = e.note + j;
                    if (note < 21 || note > 108) {          
                        min = j + 1
                        break;
                    }
                }
            }            
        }
        return {min: min, max: max};
    }
    
    midi.on('ready', function (val) {
        
        sounds = [];               
        
        var speedTempo = parseInt($('#lblPctTempo').attr('value'));
        if (speedTempo !== 100) {
            midi.changeTempoMidi(speedTempo);
        }
        
        $('#slider').attr('min', 0);
		$('#slider').attr('max', midi.durationInSecond());
		$('#slider').val(0);

        $('#btnStart').attr('disabled', false);
        
        $('#time').html(timeToString(midi.durationInSecond()));        
        
        computeSpacePiano()
        
        drawPiano();
        
        rangeTrans = canTransposeMidi();
        $('#lblValBar').attr('min', rangeTrans.min);
        $('#lblValBar').attr('max', rangeTrans.max);
        $('#lblValSignal').attr('min', rangeTrans.min);
        $('#lblValSignal').attr('max', rangeTrans.max);
        $('#lblValBar').attr('value', 0);
        $('#lblValSignal').attr('value', 0);
        $('#lblValBar').html(0);
        $('#lblValSignal').html(0);        
        
    });  
    
    midi.on('beginPlay', function () {
        lastTime = new Date();
        renderPiano();
    });
    
    midi.on('play', function () {
       if (midi.currentTime % 1000 === 0) {
           var v = midi.currentTime / 1000;
           $('#slider').val(v);
           var r = midi.durationInSecond() - v;
           $('#time').html(timeToString(r)); 
       }       
    });
    
    midi.on('pause', function() {
        sounds.forEach(function(e, idx){
            e.sound.stop(0);            
        });
    });
    
    midi.on('stop', function () {
       sounds.forEach(function(e, idx){
            e.sound.stop(0);
       });
       sounds = [];
       $('#time').html(timeToString(midi.durationInSecond()));
       drawPiano();
    });
    
    midi.on('noteOn', function (val) {
        var d = parseInt(document.getElementById('lblValSignal').getAttribute('value'));
        var volume = Math.round((mainVolume * val.velocity) / val.level) / 127;
        var duration = (val.pedalAlwaysOn === true ? Math.max(maxDurationKey, val.pedal) : (val.end - val.start + val.pedal)) / 1000;
        
        playKey(val.note + d, duration, volume, val.id);
        //playKey(val.note + d, (val.end - val.start + val.pedal) / 1000, volume, val.id);
    });
    
    midi.on('noteOff', function (val) {
        for(var i = sounds.length - 1; i >= 0; i--) {
            e = sounds[i];
            if (e.id === val.id) {                
               //e.sound.stop(0);
               if (!val.pedalAlwaysOn || val.pedal <= 0) {
                    sounds.splice(i, 1);
               }
               break;
            }
        }        
    });
    
    midi.on('changedTempo', function () {
       sounds = [];
       $('#slider').attr('max', midi.durationInSecond());
       var v = midi.durationInSecond() - $('#slider').val();
       $('#time').html(timeToString(v));
       computeSpacePiano();
       drawPiano();
    });
    
    midi.on('changedPaddingTime', function () {
       sounds = [];
       $('#slider').attr('max', midi.durationInSecond());
       var v = midi.durationInSecond() - $('#slider').val();
       $('#time').html(timeToString(v));
       computeSpacePiano();
       drawPiano();
    });
    
    midi.on('finished', function () {
       $('#slider').val(midi.durationInSecond());       
       $('#time').html(timeToString(0));
       $('#sltSF').attr('disabled', false); 
       $('#sltMidi').attr('disabled', false);
       drawPiano();
    });
    
    $('#slider').on('input', function () {        
        midi.playAtSecond($(this).val());
        var r = midi.durationInSecond() - $(this).val();
        $('#time').html(timeToString(r));
        drawPiano();        
    });
    
    $('#volume').on('input', function(){
        mainVolume = parseInt($(this).val()) / 100;
        if(mainVolume === 0)
            $('#imgVol').attr('src', 'image/soundoff.png');
        else
            $('#imgVol').attr('src', 'image/soundon.png');
    });
        
    $('#btnStart').click( function () {
        $('#sltSF').attr('disabled', true);
        $('#sltMidi').attr('disabled', true);
        
        var ua = window.navigator.userAgent;
        var iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
        var webkit = !!ua.match(/WebKit/i);
        var iOSSafari = iOS && webkit && !ua.match(/CriOS/i);
        if (iOSSafari) {
            //dummy sound
            var oscillator = ac.createOscillator();
            oscillator.frequency.value = 8.175;
            oscillator.connect(ac.destination);
            oscillator.start(0);
            oscillator.stop(.25);    
        }
        
        midi.play();        
    });
    
    $('#btnPause').click( function () {
        $('#sltSF').attr('disabled', false);
        midi.pause();
    });
    
    $('#btnStop').click( function () {
        $('#sltSF').attr('disabled', false); 
        $('#sltMidi').attr('disabled', false);
        $('#slider').val(0);
        midi.stop();
    });
    
    $('#btnTest').click(function (){
        //playKey(80, 10, 1.5, 1)
        speed++;
    })
    
    $("#dialog").dialog({
          modal: true,  
          autoOpen: false,
          width: 350,
          show: {
            effect: "blind",
            duration: 250,            
          },
          hide: {
            effect: "explode",
            duration: 250
          },
          open: function (){
            $('#rdbOn').prop('checked', showNoteLabels);
            $('#rdbOff').prop('checked', !showNoteLabels);       
          }
         /*  buttons: {
            Ok: function() {
              $( this ).dialog( "close" );
            },
            Cancel: function() {
              $( this ).dialog( "close" ); 
            }
         } */
    });
    
    $('#btnSetting').click( function (){
         $("#dialog").dialog( "open" );
    });
    
    $('#btnDcrTempo').click( function (){
        var val = parseInt($('#lblPctTempo').attr('value')) - 10;        
        val = Math.max(10, val);
        $('#lblPctTempo').attr('value', val);
        $('#lblPctTempo').html(val + '%');
        
        midi.changeTempoMidi(val);
    });
    
    $('#btnIcrTempo').click( function (){
        var val = parseInt($('#lblPctTempo').attr('value')) + 10;        
        val = Math.min(200, val);
        $('#lblPctTempo').attr('value', val);
        $('#lblPctTempo').html(val + '%');
        
        midi.changeTempoMidi(val);
    });
    
    $('#btnDcrBar').click( function () {
        var val = parseInt(document.getElementById('lblValBar').getAttribute('value')) - 1;
        var min = parseInt(document.getElementById('lblValBar').getAttribute('min'));
        val = Math.max(min, val);
        document.getElementById('lblValBar').setAttribute('value', val);
        document.getElementById('lblValBar').innerHTML = val;
        drawPiano();
    });
    
    $('#btnIcrBar').click( function () {
        var val = parseInt(document.getElementById('lblValBar').getAttribute('value')) + 1;
        var max = parseInt(document.getElementById('lblValBar').getAttribute('max'));
        val = Math.min(max, val);
        document.getElementById('lblValBar').setAttribute('value', val);
        document.getElementById('lblValBar').innerHTML = val;
        drawPiano();
    });
    
    $('#btnDcrSignal').click( function () {
        var val = parseInt(document.getElementById('lblValSignal').getAttribute('value')) - 1;
        var min = parseInt(document.getElementById('lblValSignal').getAttribute('min'));
        val = Math.max(min, val);
        document.getElementById('lblValSignal').setAttribute('value', val);
        document.getElementById('lblValSignal').innerHTML = val;
    });
    
     $('#btnIcrSignal').click( function () {
        var val = parseInt(document.getElementById('lblValSignal').getAttribute('value')) + 1;
        var max = parseInt(document.getElementById('lblValSignal').getAttribute('max'));
        val = Math.min(max, val);
        document.getElementById('lblValSignal').setAttribute('value', val);
        document.getElementById('lblValSignal').innerHTML = val;
    });
    
    $('#rdbOn, #rdbOff').on('change', function () {
       var val = parseInt($(this).attr('value'));       
       showNoteLabels = val === 1;
       $('#rdbOn').prop('checked', showNoteLabels);
       $('#rdbOff').prop('checked', !showNoteLabels);
       drawPiano();
    });
    
    $('#rdbName, #rdbChannel').on('change', function () {
        var val = parseInt($(this).attr('value'));
        styleColor = val === 1 ? 'name' : 'channel';
        $('#rdbName').prop('checked', val === 1);
        $('#rdbChannel').prop('checked', val === 2);
        changeColorNotes();
        drawPiano();
    });
    
       
    function renderPiano (){
        
        var d = (new Date()) - lastTime
        
        //console.log(d);
        
        drawPiano();
                        
        if (!midi.finished() && midi.playing()) {
            lastTime = new Date();
            requestAnimationFrame(renderPiano);
           /*  setTimeout( function(){
                requestAnimationFrame(renderPiano)
            }, speed); */
            //setTimeout(renderPiano, speed);
        }
        
    }   
   
    
    function drawPiano () {

        var valBar = parseInt(document.getElementById('lblValBar').getAttribute('value'));                    
        var canvas = document.getElementById('spaceNotes');
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        //ctx.clearRect(0, 0, 10, canvas.height);
        
        var visibleLines = [3, 8, 15, 20, 27, 32, 39, 44, 51, 56, 63, 68, 75, 80, 87];
        var corner = 10;
        
        //ctx.strokeStyle = 'rgba(255,255,255,1.0)';
        ctx.strokeStyle = '#4E4C4E';
        //ctx.lineWidth = 0.5;
        visibleLines.forEach( function(l, idx){
            e = positions[l];
            ctx.beginPath();
            ctx.moveTo(e.left - 1.9, canvas.height);
            ctx.lineTo(e.left - 1.9, 0);            
            ctx.stroke();
        });
        /* positions.forEach( function(e, idx) {
           if(e.type === 'w') {
               ctx.beginPath();
               ctx.moveTo(e.left - 1, canvas.height);
               ctx.lineTo(e.left - 1, 0);
               ctx.stroke();
           }
        }); */
            
                                
        var f = midi.currentTime / midi.duration;
		var d = scaleValueInRange(f, intervalSpace.min, intervalSpace.max) - intervalSpace.min;
        
        var map = [];
        var mapL = [];
        if (!midi.finished()) {
            actMapNotes.forEach( function(e, idx) {
                e.top = Math.round(mapNotes[idx].top + d);
                if (e.top >= displayedSpace.min && e.top <= displayedSpace.max) {
                    map.push(e);
                }
            });
             
            actMapLines.forEach( function(e, idx) {
                e = Math.round(mapLines[idx] + d);
                if (e >= displayedSpace.min && e <= displayedSpace.max) {                    
                    mapL[idx] = e;
                }
            });           
          
        }
        
        var ws = [];
        var bs = [];
        map.forEach( function(e, idx) {            
            var note = e.note - 21 + valBar;
                        
            var bottomNote = e.top + e.height;
            var key = positions[note];            
            var tt = key.top - e.top; 
            
            if (tt <= 0) {                
                if(key.type === 'w') {
                    ws.push(note);
                    ctx.fillStyle = 'white';
                    ctx.fillRect(key.left, key.top, key.width, key.height);
                }
            } else {
                var color = styleColor === 'channel' ? e.color: keyColors[note % keyColors.length];
                ctx.fillStyle = color;
                ctx.strokeStyle = color;
                ctx.lineJoin = 'round';
                ctx.lineWidth = corner;
                ctx.strokeRect(key.left + (corner / 2), e.top + (corner / 2), (key.type === 'w' ? 16 : 10) - corner, e.height - corner);
                ctx.fillRect(key.left + (corner / 2), e.top + (corner / 2), (key.type === 'w' ? 16 : 10) - corner, e.height - corner);
                //ctx.fillRect(key.left, e.top, key.type === 'w' ? 16 : 10, e.height);
                ctx.lineJoin = 'miter';
                ctx.lineWidth = 1;
                if (bottomNote >= key.top) {
                    if(key.type === 'w') {
                        ws.push(note);
                        ctx.fillStyle = color;
                        ctx.fillRect(key.left, key.top, key.width, key.height);
                    } else {
                        bs[note] = color;
                    }
                }                
               
            }
        });
                
       
        //ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.strokeStyle = '#4E4C4E';
        mapL.forEach( function(e, idx) { 
            ctx.beginPath();
            ctx.moveTo(0, e);
            ctx.lineTo(canvas.width, e);
            ctx.stroke();
            ctx.fillStyle = 'white';
            ctx.fillText(idx + 1, 0, e - 2);
        });
                
        positions.forEach( function(e, idx){
            if($.inArray(idx, ws) === -1) {
                if (e.type === 'w') {
                    ctx.fillStyle = 'white';           
                    ctx.fillRect(e.left, e.top, e.width, e.height);            
                }
            }
        });
        
        positions.forEach( function(e, idx){
            if (e.type === 'b') {        
                ctx.fillStyle = bs[idx] === undefined ? 'black' : bs[idx];
                ctx.fillRect(e.left, e.top, e.width, e.height);
            }            
        });
                
        if(showNoteLabels) {
        
            var labelWNotes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
            var labelBNotes = ['A', 'C', 'D', 'F', 'G'];
            var p = 0;
            var q = 0;
                    
            positions.forEach( function(e, idx) {
               if (e.type === 'w') {
                   ctx.font = 'bold 8px serif';
                   ctx.fillStyle = 'black';
                   ctx.fillText(labelWNotes[p % 7], e.left + whiteKeyWidth / 2 - 2, e.top + whiteKeyHeight - 2);
                   p++;
               } else {
                    ctx.font = '7px serif';
                    ctx.fillStyle = 'white';
                    ctx.fillText(labelBNotes[q % 5], e.left + blackKeyWidth / 2 - 4, e.top + blackKeyHeight / 2);
                    ctx.textBaseline = 'bottom';
                    ctx.fillText('#', e.left + blackKeyWidth / 2 + 1, e.top + blackKeyHeight / 2);
                    q++;
                    ctx.textBaseline = 'alphabetic';    
               } 
            });  
        }      
    }
    
    $('#sltSF').change(function(){      
        loadSoundFont(partialSFSrc + $(this).val() + '.js');
    });
    
    $('#sltMidi').change(function(){
        if ($(this).val() === '@browseMidi' || $(this).val() === '@blank') {
            $('#browseMidi').click();
            return;
        }
        $('#btnStart').prop('disabled', true);    
        midi.src(partialMidiSrc + $(this).val());
    });
    
    $('#browseMidi').on('change', function(){       
        var file = document.getElementById('browseMidi').files[0];
        
        if (file) {            
            $('#btnStart').prop('disabled', true);
            midi.src(file);
        }
        $('#sltMidi').val('@blank');        
    });
});


function loadSoundFont (src) {
    Soundfont.instrument(ac,
        src).then(function(instrument){
            sf = instrument;
            /* sf.play(108, 0, { duration: 2, gain: 1}); */
    });
}

function initialLocationPiano() {
	
	var distance = 19.44;
    topKey = parseInt($('#spaceNotes').css('height')) - (keyHeight - 18);
        
	positions = [];	
	for(var i = 0, j = 0, o = 1, freqs = [2, 1, 2, 2, 1, 2, 2]; i < num_white_keys; j+=freqs[i % 7], i++){					
        positions[j] = {'type': 'w', 'left': i*distance + 1, 'top': topKey, 'width': whiteKeyWidth, 'height': whiteKeyHeight};		
	}
	
	for(var i = 0, j = 1, freqs = [3, 2, 3, 2, 2]; i < num_black_keys; j+=freqs[i % 5], i++){
		var left = (distance * (j - i - 0.5)) - 0.5 + 4;
        positions[j] = {'type': 'b', 'left': left, 'top': topKey, 'width': blackKeyWidth, 'height': blackKeyHeight};
	}       
}

function playKey(note, duration, volume, id) {
    var p = sf.play(note, 0, { duration: duration, gain: volume});
    sounds.push({id: id, sound: p});
}

function getStyleSheet(cssName, rule){
    for (i = 0; i < document.styleSheets.length; i++) {
        if (document.styleSheets[i].href.toString().indexOf(cssName) != -1)
            for (x = 0; x < document.styleSheets[i].rules.length; x++) {
                if (document.styleSheets[i].rules[x].selectorText.toString().indexOf(rule) != -1)
                    return document.styleSheets[i].rules[x];
            }
    }

    return null;
}

function randomNumber(min, max)
{
    return Math.floor(Math.random()*(max - min + 1) + min);
}

function timeToString(second) {
    var m = '0' + parseInt(second / 60).toString();
    var s = '0' + (second % 60).toString();
    return m.slice(-2) + ':' + s.slice(-2);
}

String.prototype.formatUnicorn = String.prototype.formatUnicorn ||
function () {
    "use strict";
    var str = this.toString();
    if (arguments.length) {
        var t = typeof arguments[0];
        var key;
        var args = ("string" === t || "number" === t) ?
            Array.prototype.slice.call(arguments)
            : arguments[0];

        for (key in args) {
            str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
        }
    }

    return str;
};



