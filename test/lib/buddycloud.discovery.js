var should  = require('should')
  , Buddycloud = require('../../lib/buddycloud')
  , ltx     = require('ltx')
  , helper  = require('../helper')

describe('buddycloud', function() {

    var buddycloud, socket, xmpp, manager

    before(function() {
        socket = new helper.Eventer()
        xmpp = new helper.Eventer()
        manager = {
            socket: socket,
            client: xmpp,
            trackId: function(id, callback) {
                this.callback = callback
            },
            makeCallback: function(error, data) {
                this.callback(error, data)
            },
            jid: "romeo@example.com"
        }
        buddycloud = new Buddycloud()
        buddycloud.init(manager)
    })

    afterEach(function() {
        xmpp.removeAllListeners('stanza')
    })

    describe('Channel server discover', function() {

        it('Sends out expected disco#items stanzas', function(done) {
            xmpp.once('stanza', function(stanza) {
                stanza.is('iq').should.be.true
                stanza.attrs.to.should.equal('example.com')
                stanza.attrs.type.should.equal('get')
                stanza.attrs.id.should.exist
                stanza.getChild('query', buddycloud.disco.NS_ITEMS)
                    .should.exist
                done()
            })
            socket.emit('xmpp.buddycloud.discover')
        })

        it('Tracks and can handle an error response', function(done) {
            xmpp.once('stanza', function(stanza) {
                var errorResponse = helper.getStanza('iq-error')
                errorResponse.attrs.id = stanza.attrs.id
                manager.makeCallback(errorResponse)
            })
            socket.emit('xmpp.buddycloud.discover', {}, function(error, items) {
                should.not.exist(items)
                error.type.should.equal('cancel')
                error.condition.should.equal('error-condition')
                done()
            })
        })

        it('Handles disco#items and sends expected stanzas', function(done) {
            xmpp.once('stanza', function(stanza) {
                var discoInfoRequests = 0
                xmpp.on('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.to.should.include('example.com')
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.id.should.exist
                    stanza.getChild('query', buddycloud.disco.NS_INFO)
                        .should.exist
                    ++discoInfoRequests
                    if (discoInfoRequests >= 2) done()
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.emit('xmpp.buddycloud.discover')
        })

        it('Handles error responses; returns failure', function(done) {
            xmpp.once('stanza', function(stanza) {
                var discoInfoRequests = 0
                xmpp.on('stanza', function(stanza) {
                    var errorReply = helper.getStanza('iq-error')
                    errorReply.attrs.id = stanza.attrs.id 
                    manager.makeCallback(errorReply)
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.emit('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(item)
                error.should.equal('No buddycloud server found')
                done()
            })
        })

        it('Handles disco#info responses; returns failure', function(done) {
            xmpp.once('stanza', function(stanza) {
                xmpp.on('stanza', function(stanza) {
                    var infoReply = helper.getStanza('disco-info')
                    infoReply.attrs.id = stanza.attrs.id
                    manager.makeCallback(infoReply)
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.emit('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(item)
                error.should.equal('No buddycloud server found')
                done()
            })
        })

    
        it('Handles disco#info responses; returns failure', function(done) {
            xmpp.once('stanza', function(stanza) {
                var discoInfoRequests = 0
                xmpp.on('stanza', function(stanza) {
                    ++discoInfoRequests
                    if (1 === discoInfoRequests) 
                        return manager.makeCallback(helper.getStanza('disco-info'))
                    manager.makeCallback(
                        helper.getStanza('disco-info-buddycloud')
                    )
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.emit('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(error)
                item.should.equal('channels.example.com')
                buddycloud.channelServer.should.equal('channels.example.com')
                done()
            })
        })
    })
})