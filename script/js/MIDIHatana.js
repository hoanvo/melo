/**
 * @file A library for reading, manipulating, writing, and playing standard MIDI files (*.mid, *.rmi)
 * @see { @link https://en.wikipedia.org/wiki/MIDI }
 * @see { @link https://www.csie.ntu.edu.tw/~r92092/ref/midi }
 * @version 1.1
 * @author Hatana
 * @copyright Hatana 2017
 */
 
 /**
 * @class MidiPlayer
 */
 function MidiPlayer() {	
        
	var midiReader = new MidiReader()
    var orginalMidiReader = midiReader
    var eventListeners = {'ready': [], 'restart' : [],'beginPlay' : [] ,'play': [],  
        'noteOn': [], 'noteOff': [], 'pause': [], 'stop' : [], 'finished': [], 
        'changedTempo': [], 'changedPaddingTime' : []}
    var loopInMs = 10
    var intervalId = 0
    var mainVolumes = []
    var pedalTracks = []
    
    this.timelines = []
    this.timeSigs = []
    this.currentTime = 0
    this.duration = 0
    this.paddingTime = 0
    
    this.playing = function () {
        return intervalId > 0
    }
    
    this.finished = function () {
        //return (this.currentTime / 1000) >= this.durationInSecond()
        return this.currentTime >= this.duration
    }
    
    this.play = function () {
        if (this.playing())
            return
        if(this.finished()) {
           this.currentTime = 0
        }
        intervalId = setInterval(loopEvent.bind(this), loopInMs)
        fireEvent.call(this, 'beginPlay', {})
    }
    
    this.pause = function () {
        clearInterval(intervalId)
        intervalId = 0
        fireEvent.call(this, 'pause', {})
    }
    
    this.stop = function () {
        this.pause()
        this.currentTime = 0
        fireEvent.call(this, 'stop', {})
    }
    
    this.restart = function () {
        if(this.playing()) {
            this.stop()
        }
        this.timelines = []
        this.timeSigs = []        
        this.currentTime = 0
        this.duration = 0
        pedalTracks = []
        midiReader.clear()
        fireEvent.call(this, 'restart', {})
    }
    
    this.playAtSecond = function (second) {
        var s = second * 1000
        this.currentTime = s
        
        if (this.finished()) {
            this.currentTime = this.duration
            fireEvent.call(this, 'finished', {})
        }
    }
    
    this.durationInSecond = function () {
        return Math.ceil(this.duration / 1000)
    }
    
    this.on = function (name, fn) {
        if (eventListeners.hasOwnProperty(name)) {
            eventListeners[name].push(fn)
        }
    }
    
    function loopEvent () {
        fireEvent.call(this, 'play', {})
        for (var i = 0; i < this.timelines.length; i++) {
            var e = this.timelines[i]
            var deltaOn = this.currentTime - e.start
            var deltaOff = this.currentTime - e.end
            if (deltaOn >= 0 && deltaOn < loopInMs) {
                var level = 100
                for(var j = 0; j < mainVolumes.length; j++) {
                    var vol = mainVolumes[j]
                     if (e.event.channel === vol.channel) {
                        level = vol.value / 127
                        break
                    }
                }
                var val = {start: e.start, end: e.end, pedal: e.pedal, pedalAlwaysOn: e.pedalAlwaysOn, channel: e.event.channel, 
                    note: e.event.value.note, velocity: e.event.value.velocity, level: level, id: e.id}
                fireEvent.call(this, 'noteOn', val)    
                
            } else if(deltaOff >= 0 && deltaOff < loopInMs) {
                var val = {start: e.start, end: e.end, pedal: e.pedal, pedalAlwaysOn: e.pedalAlwaysOn, channel: e.event.channel, 
                    note: e.event.value.note, velocity: e.event.value.velocity, id: e.id}
                fireEvent.call(this, 'noteOff', val)
            } else if (deltaOn < 0) {
                break
            }
        }
        this.currentTime+= loopInMs
        if (this.finished()) {
            this.currentTime = this.duration
            fireEvent.call(this, 'finished', {})
            this.pause()
        }
        
    }    
    
    function fireEvent (name, val) {
        if (eventListeners.hasOwnProperty(name)) {
            eventListeners[name].forEach( function(fn, idx) {
                fn.call(this, val)
            })
        }
    }    
			
	this.src = function (url) {
        
        this.restart()
        
        if (typeof url === 'object') {
            var reader = new FileReader()
            reader.onload = onReady
            reader.arguments = [this]
            reader.readAsArrayBuffer(url)
        } else {        
            var request = new XMLHttpRequest()
            request.open('GET', url, true)
            request.responseType = 'arraybuffer'
            request.arguments = [this]
            request.onload = onReady
            request.send()
        }
	}
            
	
	function onReady() {
        
        if(this.response === undefined) {           
            midiReader.buffers(this.result)
        } else {
            midiReader.buffers(this.response)
        }         
        
        orginalMidiReader = JSON.parse(JSON.stringify(midiReader));
        this.arguments[0].duration = this.arguments[0].getDuration() + this.arguments[0].paddingTime
        this.arguments[0].timelines =  this.arguments[0].scheduleNotes()
        this.arguments[0].timeSigs = this.arguments[0].scheduleTimeSig()
        
        mainVolumes = midiReader.mainChannelVolumes()
        for (var number in midiReader.tracks) {
            pedalTracks[number] = getPedalsInTrack(number)
        }
        
        fireEvent.call(this.arguments[0], 'ready', {})
                
	}
	
	this.getDuration = function () {
		var duration = 0
		var devision = midiReader.header.devision.val
		var unit = 1 / devision / 1000
		//find tempo(s) in first track
		var firstTrack = midiReader.tracks[0]
		var currentTempo = 0
		var prevAbsolute = 0        
		for (var i in firstTrack.events) {
			var e = firstTrack.events[i]
			if (e.message !== 'tempo') {
				continue
            }
			
			var d = e.absolute - prevAbsolute
			duration+= d * currentTempo * unit
			currentTempo = e.data.value
			prevAbsolute = e.absolute          
		}
        if (currentTempo === 0)
            currentTempo = 500000
		//find last event in all tracks and get max absolute of them
		var lastAbsolute = prevAbsolute
		for (var i in midiReader.tracks) {
			var track = midiReader.tracks[i]
			var lastE = track.events[track.events.length - 1]
			lastAbsolute = Math.max(lastE.absolute, lastAbsolute)
		}
		if (lastAbsolute > prevAbsolute) {
			var d = lastAbsolute - prevAbsolute
			duration+= d * currentTempo * unit
		}

		return Math.round(duration)
	}
	
	   
    this.scheduleTimeSig = function () {
        
        //find last event in all tracks and get max absolute of them
		var maxAbsolute = 0
		for (var i in midiReader.tracks) {
			var track = midiReader.tracks[i]
            for (var j = track.events.length - 1; j >= 0; j--) {
                if (track.events[j].message === 'noteon' || track.events[j].message === 'noteoff') {
                    maxAbsolute = Math.max(track.events[j].absolute, maxAbsolute)
                    break
                }
            }
						
		}
        
		var timeSigs = []  
        var temp = []  
        var prev = 0
        var unit = 1 / midiReader.header.devision.val / 1000
        intervals = midiReader.getIntervalTimeSig()
        
        var ms = 0 + this.paddingTime   
        intervals.forEach( function (e, idx){
            var cur = e.absolute
            var next = intervals[idx + 1] === undefined ? maxAbsolute : intervals[idx + 1].absolute
                       
            while (cur <= next && cur <= maxAbsolute) {
                prev = cur
                cur+= e.value
                temp.push(cur)
                if(cur <= next && cur <= maxAbsolute) {
                    var t = prev
                    while (true) {
                        var info = nearestTempo(t)
                        
                        if (info.tick > cur) {
                            info.tick = cur
                        }
                        
                        var d = (info.tick - t) * info.tempo * unit
                        if (d > 0)
                            ms+= d
                        if (info.tick === cur)
                            break
                        t = info.tick + 1
                    }
                    
                    timeSigs.push(Math.round(ms))
                }
            }
        })
        
        return timeSigs
    }
    
    this.scheduleNotes = function () {
        
		var lines = []
		var devision = midiReader.header.devision.val
		var unit = 1 / devision / 1000
        var id = 0
        
		for (var number in midiReader.tracks ) {            
			var events = midiReader.tracks[number].events
            
            //find pedal in a track
            var pedals = []
            for (var index = 0; index < events.length; index++) {
                var e = events[index]
                if (e.message !== 'controllerchange') {
                    continue
                }                
                if (e.value.number !== 64) {                    
                    continue        
                }
                
                if (e.value.value < 64) {
                    continue
                }
                var on = e.absolute
                var off = events[events.length - 1].absolute
                var alwaysOn = true
                for (var j = index + 1; j < events.length; j++) {
                    var je = events[j]
                    if (je.message !== 'controllerchange') {
                        continue
                    }
                    if (je.value.number !== 64) {
                        continue
                    }  
                    if (je.value.value >= 64) {
                        continue
                    }
                    off = je.absolute
                    alwaysOn = false
                    break
                }              
                
                pedals.push({start: on, end: off, alwaysOn: alwaysOn})
            }
            
            var totalMs = 0 + this.paddingTime
            var lastAbsolute = 0            
			for (var index = 0; index < events.length; index++) {
				var e = events[index]
				if (e.message !== 'noteon') {
					continue
                }
				if(e.value.velocity === 0) {                  
					continue
                }
				var absoluteStart = e.absolute
                
               /*  var t = lastAbsolute
                var d = 0
                while (true) {
                    var info = nearestTempo(t)
                    if (info.tick > absoluteStart)
                        info.tick = absoluteStart
                    if ( (info.tick - t) > 0 )
                        d += (info.tick - t) * info.tempo * unit
                    if (info.tick === absoluteStart)
                        break                   
                    
                    t = info.tick + 1
                } */
                var d = durationInIntervalTick(lastAbsolute, absoluteStart)
                
                totalMs+= d
                
                lastAbsolute = absoluteStart
                
				var absoluteEnd = e.absolute
				for(var j = index + 1; j < events.length; j++) {
					var je = events[j]
					
					var off = (je.message === 'noteoff')
					var on = (je.message === 'noteon') && (je.value.velocity === 0)
					var mandatory = (je.channel === e.channel) && (je.value.note === e.value.note)
					
					if (mandatory === true) {
						if (on || off) {
							absoluteEnd = je.absolute
							break
						}
					}					
				}        				
                
                var start = Math.round(totalMs)
                
                /* t = absoluteStart + 1
                d = 0
                while (true) {
                    var info = nearestTempo(t)
                    
                    if (info.tick > absoluteEnd)
                        info.tick = absoluteEnd
                    
                    d += (info.tick - t) * info.tempo * unit              
                    if (info.tick === absoluteEnd)
                        break
                    t = info.tick + 1
                } */
                
                var d = durationInIntervalTick(absoluteStart + 1, absoluteEnd)
                
                var sd = 0
                var alwaysOn = false
                for (var k = 0; k < pedals.length; k++) {
                    var p = pedals[k]
                    if (absoluteStart >= p.start && absoluteStart <= p.end) {
                        sd = durationInIntervalTick(absoluteEnd, p.end)
                        alwaysOn = p.alwaysOn
                        break
                    }
                }               
                
                var end = Math.round(totalMs + d)
				
                if (start > this.duration) {
                    console.log('Warning',start, this.duration)
                }
				
				var note = {event: e, id: id++, absoluteStart: absoluteStart, absoluteEnd: absoluteEnd, start: start, end: end, pedal: sd, pedalAlwaysOn: alwaysOn, track: number}
                
                /* if (sd > 0)
                    console.log(sd, alwaysOn) */
                
                lines.push(note)
			}
		}
		lines.sort(sortBy('start', false))
        return lines
	}
    
    function getPedalsInTrack (number) {
        
        var events = midiReader.tracks[number].events
        //find pedal in a track
        var pedals = []
        for (var index = 0; index < events.length; index++) {
            var e = events[index]
            if (e.message !== 'controllerchange') {
                continue
            }                
            if (e.value.number !== 64) {                    
                continue        
            }
            
            if (e.value.value < 64) {
                continue
            }
            var on = e.absolute
            var off = events[events.length - 1].absolute
            var alwaysOn = true
            for (var j = index + 1; j < events.length; j++) {
                var je = events[j]
                if (je.message !== 'controllerchange') {
                    continue
                }
                if (je.value.number !== 64) {
                    continue
                }  
                if (je.value.value >= 64) {
                    continue
                }
                off = je.absolute
                alwaysOn = false
                break
            }              
            
            pedals.push({start: on, end: off, alwaysOn: alwaysOn})
        }
        return pedals
    }
    
    function nearestTempo (tick) {
        if(tick === undefined) {
			tick = 0
		}
        var obj = undefined
        var lastTempo = 0
        var lastTick = 0
		var firstTrack = midiReader.tracks[0]
        for (var i in firstTrack.events) {
			var e = firstTrack.events[i]	
			if (e.message !== 'tempo')
				continue            
            if (e.absolute > tick) {
                obj = {tick: e.absolute - 1, tempo: lastTempo}
                break                
            }
            lastTempo = e.data.value
            lastTick = e.absolute
        }
        if(obj === undefined) {
            obj = {tick: Number.MAX_SAFE_INTEGER, tempo: lastTempo === 0 ? 500000 : lastTempo}
        }
        return obj
    }

    function durationInIntervalTick (start, end) {
        var devision = midiReader.header.devision.val
		var unit = 1 / devision / 1000
        
        var t = start
        var d = 0
        while (true) {
            var info = nearestTempo(t)
            if (info.tick > end)
                info.tick = end
            if ( (info.tick - t) > 0 )
                d += (info.tick - t) * info.tempo * unit
            if (info.tick === end)
                break                   
            
            t = info.tick + 1    
        }
        
        return d
    }        
    
    this.changeTempoMidi = function (percent) {        
                
        var firstTrack = midiReader.tracks[0]
        for (var i in firstTrack.events) {
			var e = firstTrack.events[i]
			if (e.message !== 'tempo')
				continue
            var d = 100 / percent
            var tempo = orginalMidiReader.tracks[0].events[i].data.value
            var newTempo = tempo * d
            e.data.value = newTempo
        }
        this.duration = this.getDuration()
        this.timelines = this.scheduleNotes()
        this.timeSigs = this.scheduleTimeSig()
        
        fireEvent.call(this, 'changedTempo', {})
    }
    
    this.changePaddingTime = function (second) {
        var ms = parseInt(second || 0) * 1000
        this.paddingTime = ms
        this.duration+= ms
        this.timelines = this.scheduleNotes()
        this.timeSigs = this.scheduleTimeSig()
        
        fireEvent.call(this, 'changedPaddingTime', {})
    }
    
    this.getChannels = function () {
        var arrays = []
        for (var number in midiReader.tracks ) {			
            var events = midiReader.tracks[number].events
            for (var index = 0; index < events.length; index++) {
                var e = events[index]
                if (e.message !== 'noteon')
                    continue
                
                arrays[e.channel] = true
            }
        }
        
        var channels = []
        arrays.forEach( function(e, idx){
            if (e === true) {
                channels.push(idx)
            }
        })
        
        return channels
    }
	
	/* Notes: controller change (0xB) number=7 value=127 | Main Volume 
                                      number = 64 value [0-127] | Damper Pedal (Sustain) | Off: 0-63 On: 64-127  
    */
 }
 
 /**
 * @class MidiReader
 */
 function MidiReader() {
	 
	this.header = {
		format: {},
		devision: {},
		track: {},
		setFormat: function (number) {
			var obj = {}
			obj.val = number
			switch (number) {
				case 0:
					obj.desc = 'MIDI file consists of a header and a single track'
					break
				case 1:
					obj.desc = 'MIDI file consists of a header and one or more track, with all tracks being played simultaneously'
					break
				case 2:
					obj.desc = 'MIDI file consists of a header and one or more track, where each track represents an independant sequence'
					break
			}
			this.format = obj
		},
		setDivision: function (number) {
			var obj = {val: number, desc: 'Ticks per beat'}
			this.devision = obj
		},
		setTrack: function (number) {
			var obj = {val: number, desc: 'Number of tracks'}
			this.track = obj
		}
	}
	
	this.tracks = []
	
    this.clear = function () {
        this.tracks = []
        this.header.format = {}
        this.header.devision = {}
        this.header.track = {}
    }
    
    this.getIntervalTimeSig = function () {
        if (this.tracks.length === 0)
            return []
        var octs = []
        for(var i = 1, j = 4, k = 768; i < 10; i++, j/=2, k/=2) {
            octs[j] = k
        }
        var trk = this.tracks[0].events
        var interval = [];
        for (var i = 0; i < trk.length; i++) {
            var e = trk[i]
            if (e.message === 'timesignature') {
                var num = e.data.numerator
                var de = Math.pow(2, e.data.logdenominator)
                interval.push({absolute: e.absolute, value: octs[(4 / de)] * num})                
            }
        }
        
        if (interval.length === 0)
            interval.push({absolute: 0, value: octs[1] * 4})
        
        return interval
    }
    
    this.mainChannelVolumes = function () {
        var volumes = []
        this.tracks.forEach(function(trk, idx){
            trk.events.forEach(function(e){
                if(e.message === 'controllerchange') {
                    if(e.value.number === 7)
                        volumes.push({tick: e.absolute, channel: e.channel, value: e.value.value})                        
                }
            })
        })
        return volumes
    }
    
	this.buffers = function (buffers) {
		if (buffers === undefined || buffers.length === 0) {
			throw new MidiException('Error while loading file.')
		}
		
		var stream = {
			position: 0,
			data: new DataView(buffers),
			readUint8: function () {
				let val = this.data.getUint8(this.position++)
				return val
			},			
			readInt8: function () {
				let val = this.data.getInt8(this.position++)
				return val
			},
			readUint16: function () {
				let val = this.data.getUint16(this.position)
				this.position+= 2
				return val
			},
			readUint32: function () {
				let val = this.data.getUint32(this.position)
				this.position+= 4
				return val
			},
			readVarInt: function () {
				var val = 0
				var i = 0
				while (i < 4) {
					var b = this.readUint8()
					i++
					if (b & 0x80) {//0x80 : 128 = 2^7
						val+= (b & 0x7F) //0x7F : 127 = 2^7 - 1
						val <<= 7
					} else {
						return {val: val + b, len: i}
					}
				}
				return {val: -1, len: i}//error
			},
			readBytes: function (length) {
				var bytes = []
				for (let i = 0; i < length; i++) {
					let val = this.readUint8()
					bytes.push(val)
				}
				return bytes
			}
		}
		
		let bytes = stream.readBytes(4)
		let type = bytes2String(bytes)
		let length = stream.readUint32()
		if (type !== 'MThd' || length !== 6) {
			throw new MidiException('Not supported file format.')
		}
		let format = stream.readUint16()
		if (format < 0 || format > 2) {
			throw new MidiException('Not supported file format.')
		}		
		this.header.setFormat(format)
		
		var track = stream.readUint16()
		this.header.setTrack(track)
		
		var a = stream.readUint8()
		var b = stream.readUint8()
		var ab = int2BinaryNbit(a) + int2BinaryNbit(b)
		if (ab.charAt() === '0') {
			let division = parseInt(ab.substring(1), 2)
			this.header.setDivision(division)
		}
		
		var remainTracks = track
        var lastEventName = ''
        var lastChannel = 0
		while(remainTracks-- > 0) {
		
			bytes = stream.readBytes(4)
			type = bytes2String(bytes)
			length = stream.readUint32()			
			
			var iTrack = {number: track - remainTracks, events: []}
							
			var remainBytes = length
			var delta = {val: 0, len: 0}
			var absolute = 0
			while (remainBytes > 0) {
				// read delta time				
				delta = stream.readVarInt()
				absolute+= delta.val
				remainBytes-= delta.len				
				//read event
				a = stream.readUint8()					
				remainBytes--
				var hex = '0x' + a.toString(16).toUpperCase()				 			
				switch (hex) {
					case '0xFF': //meta event
						var x = stream.readUint8()
						remainBytes--
						x = '0x' + x.toString(16).toUpperCase()
						var m = ''
						var n = ''
						var o = ''
						var metaEvent = new MetaEvent()
						metaEvent.setDelta(delta.val)
						metaEvent.setAbsolute(absolute)
						switch (x) {
							case '0x0': //sequence number
								stream.readBytes(1)
								m = stream.readUint16()								
								remainBytes-= 3
								metaEvent.sequenceNumber(m)								
								break
							case '0x1': //text event
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val								
								metaEvent.metaText('textevent', n)
								break
							case '0x2': //copyright notice
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val
								metaEvent.metaText('copyrightnotice', n)								
								break
							case '0x3': //track name
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val
								metaEvent.metaText('trackname', n)                                     
								break
							case '0x4': //instrument name
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val
								metaEvent.metaText('instrumentname', n)                                   
								break
							case '0x5': //lyric
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val
								metaEvent.metaText('lyric', n)								
								break
							case '0x6': //marker
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val
								metaEvent.metaText('marker', n)								
								break
							case '0x7': //cue point
								m = stream.readVarInt()
								remainBytes-= m.len
								n = bytes2String(stream.readBytes(m.val))
								remainBytes-= m.val
								metaEvent.metaText('cuepoint', n)								
								break
							case '0x20': //midi channel prefix
                                if (stream.readUint8() === 0) {
                                   remainBytes--
                                } else {								
                                    m = stream.readUint8()
                                    remainBytes-= 2
                                    metaEvent.midiChannelPrefix(m)
                                    lastEventName = 'metachannelprefix'                                       
                                }
                                break
							case '0x21':
								if (stream.readUint8() === 0) {
                                   remainBytes--
                                } else {
                                    m = stream.readUint8()
                                    remainBytes-= 2
                                    metaEvent.midiChannelPrefix(m)                               
                                }                               
								break
							case '0x2F': //end of track
								stream.readBytes(1)
								remainBytes--
								metaEvent.metaText('endoftrack', 'end of track')								
								break
							case '0x51': //set tempo
								stream.readBytes(1)
								remainBytes--
								m = stream.readUint8() << 16
								n = stream.readUint8() << 8
								o = stream.readUint8()
								remainBytes-= 3
								metaEvent.tempo(m + n + o)								
								break
							case '0x54': //smtpe offset
								stream.readBytes(1)
								remainBytes--
								m = []
								for(let i = 0; i < 5; i++) {
									m.push(stream.readUint8()) //hh:mm:ss:fr:fs
									remainBytes--
								}
								metaEvent.smtpeOffset(m[0], m[1], m[2], m[3], m[4])								
								break
							case '0x58': //time signature
								stream.readBytes(1)
								remainBytes--
								m = []
								for(let i = 0; i < 4; i++) {
									m.push(stream.readUint8())
									remainBytes--
								}
								metaEvent.timeSignature(m[0], m[1], m[2], m[3])								
								break
							case '0x59': //key signature
								stream.readBytes(1)
								remainBytes--
								m = []
								m.push(stream.readInt8())
								m.push(stream.readInt8())
								remainBytes-= 2
								metaEvent.keySignature(m[0], m[1])								
								break
							case '0x7F': //sequencer-specific meta-event
								m = stream.readVarInt()
								remainBytes-= m.len								
								n = stream.readBytes(m.val)
								remainBytes-= m.val								
								n = bytesToHex(n)
								metaEvent.sequencerSpecific(n)								
								break
							default:
                                m = stream.readVarInt()                             
                                var delBytes = remainBytes - m.val                          
                                remainBytes-= m.len
                                if (delBytes < 0) {                                  
                                   throw new MidiException('Unknown value: ' + x)
                                } else {
                                    var i = m.val
                                    var data = []
                                    while (i-- > 0) {
                                      data.push(stream.readUint8())
                                      remainBytes--
                                    }
                                    metaEvent.metaCode(x, data.join(' '))
                                }								
								break
						}
						iTrack.events.push(metaEvent)
						break
					case '0xF0': //F0 Sysex Event
						var m = stream.readVarInt()
						remainBytes-= m.len
						var n = stream.readBytes(m.val)
						remainBytes-= m.val
						var sysEvent = new SysEvent()
						sysEvent.setDelta(delta.val)
						sysEvent.setAbsolute(absolute)
						n = bytesToHex(n)
						sysEvent.F0(n)
						iTrack.events.push(sysEvent)						
						break
					case '0xF7': //F7 Sysex Event
						var m = stream.readVarInt()
						remainBytes-= m.len
						var n = stream.readBytes(m.val)
						remainBytes-= m.val
						var sysEvent = new SysEvent()
						sysEvent.setDelta(delta.val)
						sysEvent.setAbsolute(absolute)
						n = bytesToHex(n)
						sysEvent.F7(n)
						iTrack.events.push(sysEvent)						
						break
					default:						
                        var st = a >> 4 //midi event
						var channel = a - st*16 + 1                         
						st = '0x' + st.toString(16).toUpperCase()
						var midiEvent = new MidiEvent()
						midiEvent.setDelta(delta.val)
						midiEvent.setAbsolute(absolute)
						midiEvent.setChannel(channel)						
						switch (st) {
							case '0x8': //note off
								var key = stream.readUint8()
								var velocity = stream.readUint8()
								remainBytes-= 2
								midiEvent.noteOff(key, velocity)
                                lastEventName = 'noteoff'
                                lastChannel = channel															
								break
							case '0x9': //note on
								var key = stream.readUint8()
								var velocity = stream.readUint8()
								remainBytes-= 2
								midiEvent.noteOn(key, velocity)
                                lastEventName = 'noteon'
                                lastChannel = channel								                                
								break
							case '0xA': //polyphonic key pressure
								var key = stream.readUint8()
								var velocity = stream.readUint8()
								remainBytes-= 2
								midiEvent.polyphonicKeyPressure(key, velocity)
                                lastEventName = 'poly'
                                lastChannel = channel								
								break
							case '0xB': //controller change
								var ctlNumber = stream.readUint8()
								var ctlValue = stream.readUint8()
								remainBytes-= 2
								midiEvent.controllerChange(ctlNumber, ctlValue)
                                lastEventName = 'control'
                                lastChannel = channel								
								break
							case '0xC': //program change
								var num = stream.readUint8()
								remainBytes--
								midiEvent.programChange(num)
                                lastEventName = 'program'
                                lastChannel = channel							
								break
							case '0xD': //channel key pressure
								var val = stream.readUint8()
								midiEvent.channelKeyPressure(val)
								remainBytes--
                                lastEventName = 'channelkey'
                                lastChannel = channel								
								break
							case '0xE': //pitch bend								
								var m = (stream.readUint8() & 0x7F) | ((stream.readUint8() & 0x7F) << 7) //lsb | msb						
								remainBytes-= 2
								midiEvent.pitchBend(m)
                                lastEventName = 'pb'
                                lastChannel = channel								
								break
							default: //repeat last event
                                switch (lastEventName) {
                                    case 'noteon':
                                        var key = a
                                        var velocity = stream.readUint8()
                                        remainBytes-= 1
                                        midiEvent.noteOn(key, velocity)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'noteoff':
                                        var key = a
                                        var velocity = stream.readUint8()
                                        remainBytes-= 1
                                        midiEvent.noteOff(key, velocity)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'poly':
                                        var key = a
                                        var velocity = stream.readUint8()
                                        remainBytes-= 1
                                        midiEvent.polyphonicKeyPressure(key, velocity)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'control':
                                        var ctlNumber = a
                                        var ctlValue = stream.readUint8()
                                        remainBytes-= 1
                                        midiEvent.controllerChange(ctlNumber, ctlValue)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'program':
                                        var num = a                                        
                                        midiEvent.programChange(num)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'channelkey':
                                        var val = a
                                        midiEvent.channelKeyPressure(val)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'pb':
                                        var m = (a & 0x7F) | ((stream.readUint8() & 0x7F) << 7) //lsb | msb						
                                        remainBytes-= 1
                                        midiEvent.pitchBend(m)
                                        midiEvent.setChannel(lastChannel)                                        
                                        break
                                    case 'metachannelprefix':                                        
                                        m = stream.readUint8()
                                        remainBytes-= 1
                                        metaEvent.midiChannelPrefix(m)                                        
                                        break
                                    default:                                        
                                        throw new MidiException('Unknown value: ' + st)
                                        break
                                }								 	
								break
						}
						iTrack.events.push(midiEvent)
						break
					
				}
			}
			
			this.tracks.push(iTrack)
		}
	}
	
	return this
 }
 
 /**
 * @class MidiEvent
 */
 function MidiEvent() {
	this.delta = 0
	this.absolute = 0
	this.message = ''
	this.channel = 0
	this.value = {}
		
	this.setDelta = function (value) {
		this.delta = value
	}
	this.setAbsolute = function (value) {
		this.absolute = value
	}
	this.setChannel = function (value) {
		this.channel = value
	}
	this.noteOn = function (note, velocity) {
		this.message = 'noteon'
		this.value.note = note
		this.value.velocity = velocity
	}
	this.noteOff = function (note, velocity) {
		this.message = 'noteoff'
		this.value.note = note
		this.value.velocity = velocity
	}
	this.polyphonicKeyPressure = function (note, pressure) {
		this.message = 'polyphonickeypressure'
		this.value.note = note
		this.value.pressure = pressure
	}
	this.controllerChange = function (number, value) {
		this.message = 'controllerchange'
		this.value.number = number
		this.value.value = value       
	}
	this.programChange = function (number) {
		this.message = 'programchange'
		this.value.number = number
	}
	this.channelKeyPressure = function (pressure) {
		this.message = 'channelkeypressure'
		this.value.pressure = pressure
	}
	this.pitchBend = function (value) {
		this.message = 'pitchbend'
		this.value.value = value
	}
	this.formatText = function (delta) {
		var txt = ''
		if (delta === true || delta === 1) {
			txt = 'delta=' + this.delta
		} else if(delta === false || delta === 0) {
			txt = 'absolute={0} '.formatH(this.absolute)
		} else {
			txt = 'delta={0} absolute={1} '.formatH(this.delta, this.absolute)
		}
		txt+= 'message={0} channel={1} '.formatH(this.message ,this.channel)
		var keys = Object.keys(this.value)	
		for (name of keys) {
			txt+= '{0}={1} '.formatH(name, this.value[name])
		}
		
		return txt
	}
	return this
}

 /**
 * @class SysEvent
 */
 function SysEvent() {
	this.delta = 0
	this.absolute = 0
	this.message = ''
	this.data = ''
	this.setDelta = function (value) {
		this.delta = value
	}
	this.setAbsolute = function (value) {
		this.absolute = value
	}
	this.F0 = function (data) {
		this.message = 'sysexevent'
		this.data = data
	}
	this.F7 = function (data) {
		this.message = 'sysexevent'
		this.data = data
	}
	this.formatText = function (delta) {
		var txt = ''
		if (delta === true || delta === 1) {
			txt = 'delta=' + this.delta
		} else if(delta === false || delta === 0) {
			txt = 'absolute={0} '.formatH(this.absolute)
		} else {
			txt = 'delta={0} absolute={1} '.formatH(this.delta, this.absolute)
		}
		txt+= 'message={0} data={1}'.formatH(this.message ,this.data)		
		
		return txt
	}
	return this
}

 /**
 * @class MetaEvent
 */
 function MetaEvent() {
	this.delta = 0
	this.absolute = 0
	this.message = ''
	this.data = {}
	this.setDelta = function (value) {
		this.delta = value
	}
	this.setAbsolute = function (value) {
		this.absolute = value
	}
	this.metaText = function (message, txt) {
		this.message = message
		this.data.text = txt
	}
	this.sequenceNumber = function (number) {
		this.message = 'sequencenumber'
		this.data.number = number
	}
	this.midiChannelPrefix = function (channel) {
		this.message = 'midichannelprefix'
		this.data.channel = channel
	}
    this.metaCode = function (code, value) {
        this.message = 'metacode'
        this.data = {code: code, value: value}
    }
	this.tempo = function (value) {
		this.message = 'tempo'
		this.data.value = value
	}
	this.smtpeOffset = function (hour, minute, second, frame, fractionalFrame) {
		this.message = 'smtpeoffset'
		this.data = {hour: hour, minute: minute, second: second, frame: frame, fractionalframe: fractionalFrame}			
	}
	
	this.timeSignature = function (numerator, logDenominator, midiClocksPerMetronomeClick, thirtySecondsPer24Clocks) {
		this.message = 'timesignature'
		this.data = {numerator: numerator, logdenominator: logDenominator, 
			midiclockspermetronomeclick: midiClocksPerMetronomeClick, thirtysecondsper24clocks: thirtySecondsPer24Clocks}
        
    }
	this.keySignature = function (sf, mi) {
		this.message = 'keysignature'
		this.data = {numbersharpsflats: sf, majorminor: mi === 0 ? 'major' : 'minor'}			
	}
	this.sequencerSpecific = function (data) {
		this.message = 'sequencerspecific'
		this.data = {value: data}
	}
	this.formatText = function (delta) {
		var txt = ''
		if (delta === true || delta === 1) {
			txt = 'delta=' + this.delta
		} else if(delta === false || delta === 0) {
			txt = 'absolute={0} '.formatH(this.absolute)
		} else {
			txt = 'delta={0} absolute={1} '.formatH(this.delta, this.absolute)
		}
		txt+= 'message={0} '.formatH(this.message)
		var keys = Object.keys(this.data)	
		for (name of keys) {
				txt+= '{0}={1} '.formatH(name, this.value[name])
		}		
		
		return txt
	}
	return this	
}
 
 
 function bytes2String(bytes) {
	var str = ''
	for (let i = 0; i < bytes.length; i++) {			
		str += String.fromCharCode(bytes[i])
	}	
	return str
}
	
function btyes2UintBE (bytes) {
	var val = 0
	for (let i = bytes.length - 4; i < bytes.length; i++) {
		val = (val << 8) + bytes[i]
	}
	return val
}

function int2BinaryNbit (number, n) {
	n = parseInt(n || '8')
	var b = number.toString(2)
	var str = b.length >= n ? b : new Array(n - b.length + 1).join('0') + b
	return str
}
 
 function toHexString (byteArray) {
	var s = '0x'
		byteArray.forEach(function(b) {
		s += ('0' + (b & 0xFF).toString(16)).slice(-2).toUpperCase()
	})
	return s
}
 
 function MidiException (message, print) {
	this.message = message
	print = print || false	
	if (print === true) {
		printLogH(message)
	}		
 }
 
 function printLogH (message) {
	let m = 'From MIDIHatana: {0}'.formatH(message)
 }
 
 // Convert a hex string to a byte array
 function hexToBytes(hex) {
	var bytes = []
    for (let c = 0; c < hex.length; c+= 3){
		bytes.push(parseInt(hex.substr(c, 2), 16));
	}
    return bytes;
}

// Convert a byte array to a hex string
 function bytesToHex(bytes) {
	var hex = []
    for (let i = 0; i < bytes.length; i++) {
		let h = (bytes[i] >>> 4).toString(16) + (bytes[i] & 0xF).toString(16)       
        hex.push(h);
    }
    return hex.join(' ');
}
 
 String.prototype.formatH = String.prototype.formatH || function () {
    "use strict"
    var str = this.toString()
    if (arguments.length) {
        var t = typeof arguments[0]
        var args = ("string" === t || "number" === t) ? Array.prototype.slice.call(arguments): arguments[0];
        for (let key in args) {
            str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
        }
    }
    return str;
};

 function sortBy (field, reverse, primer) {

   var key = primer ? function(x) {return primer(x[field])} : function(x) {return x[field]}

   reverse = !reverse ? 1 : -1

   return function (a, b) {
       return a = key(a), b = key(b), reverse * ((a > b) - (b > a))
   }
 } 
 
 function scaleValueInRange (rate, min, max) {
	rate = !rate ? 0 : Math.min(rate, Math.max(rate, 1))
	return rate * (max - min) + min
 }
 
 /** 
 * MIDI note number to frequency
 * Note number: range [0 - 127]. 
 * Frequency: Min: 8.175798915643707 Max: 12543.853951415984
 * @see { https://pages.mtu.edu/~suits/NoteFreqCalcs.html }
 */
 function frequencyOfNote (note) {
	note = note < 0 ? 0 : Math.min(note, 127)
	return 13.75 * Math.pow(2, (note - 9) / 12) // 13.75 = 440 / 32
 }
