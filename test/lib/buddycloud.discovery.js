'use strict';

var should  = require('should')
  , Buddycloud = require('../../index')
  , helper  = require('../helper')

/* jshint -W030 */
describe('buddycloud', function() {

    var buddycloud, socket, xmpp, manager

    before(function() {
        socket = new helper.SocketEventer()
        xmpp = new helper.XmppEventer()
        manager = {
            socket: socket,
            client: xmpp,
            trackId: function(id, callback) {
                this.callback = callback
            },
            makeCallback: function(error, data) {
                this.callback(error, data)
            },
            jid: 'romeo@example.com',
            _getLogger: function() {
                return {
                    log: function() {},
                    info: function() {},
                    error: function() {},
                    warn: function() {}
                }
            },
            getJidType: function(type) {
                if ('domain' !== type)
                    throw new Error('Unexpected JID type requested')
                return 'example.com'
            }
        }
        buddycloud = new Buddycloud()
        buddycloud.init(manager)
    })

    beforeEach(function() {
        socket.removeAllListeners()
        xmpp.removeAllListeners()
        buddycloud.init(manager)
        buddycloud.channelServer = 'channels.example.com'
    })

    describe('Channel server discover', function() {

        it('Errors when no callback provided', function(done) {
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            socket.once('xmpp.error.client', function(error) {
                error.type.should.equal('modify')
                error.condition.should.equal('client-error')
                error.description.should.equal('Missing callback')
                error.request.should.eql({})
                xmpp.removeAllListeners('stanza')
                done()
            })
            socket.send('xmpp.buddycloud.discover', {})
        })

        it('Errors when non-function callback provided', function(done) {
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            socket.once('xmpp.error.client', function(error) {
                error.type.should.equal('modify')
                error.condition.should.equal('client-error')
                error.description.should.equal('Missing callback')
                error.request.should.eql({})
                xmpp.removeAllListeners('stanza')
                done()
            })
            socket.send('xmpp.buddycloud.discover', {}, true)
        })

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
            socket.send('xmpp.buddycloud.discover', null, function() {})
        })

        it('Tracks and can handle an error response', function(done) {
            xmpp.once('stanza', function(stanza) {
                var errorResponse = helper.getStanza('iq-error')
                errorResponse.attrs.id = stanza.attrs.id
                manager.makeCallback(errorResponse)
            })
            socket.send('xmpp.buddycloud.discover', {}, function(error, items) {
                should.not.exist(items)
                error.type.should.equal('cancel')
                error.condition.should.equal('error-condition')
                done()
            })
        })

        it('Handles disco#items and sends expected stanzas', function(done) {
            xmpp.once('stanza', function() {
                var discoInfoRequests = 0
                xmpp.on('stanza', function(stanza) {
                    stanza.is('iq').should.be.true
                    stanza.attrs.to.should.include('example.com')
                    stanza.attrs.type.should.equal('get')
                    stanza.attrs.id.should.exist
                    stanza.getChild('query', buddycloud.disco.NS_INFO)
                        .should.exist
                    discoInfoRequests++
                    if (discoInfoRequests >= 2) done()
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.send('xmpp.buddycloud.discover', null, function() {})
        })

        it('Handles error responses; returns failure', function(done) {
            xmpp.once('stanza', function() {
                xmpp.on('stanza', function(stanza) {
                    var errorReply = helper.getStanza('iq-error')
                    errorReply.attrs.id = stanza.attrs.id
                    manager.makeCallback(errorReply)
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.send('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(item)
                error.should.equal('No buddycloud server found')
                done()
            })
        })

        it('Handles disco#info responses; returns failure', function(done) {
            xmpp.once('stanza', function() {
                xmpp.on('stanza', function(stanza) {
                    var infoReply = helper.getStanza('disco-info')
                    infoReply.attrs.id = stanza.attrs.id
                    manager.makeCallback(infoReply)
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.send('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(item)
                error.should.equal('No buddycloud server found')
                done()
            })
        })


        it('Handles disco#info responses; returns failure', function(done) {
            xmpp.once('stanza', function() {
                var discoInfoRequests = 0
                xmpp.on('stanza', function() {
                    ++discoInfoRequests
                    if (1 === discoInfoRequests)
                        return manager.makeCallback(
                            helper.getStanza('disco-info')
                        )
                    manager.makeCallback(
                        helper.getStanza('disco-info-buddycloud')
                    )
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.send('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(error)
                item.should.equal('channels.example.com')
                buddycloud.channelServer.should.equal('channels.example.com')
                done()
            })
        })

        it('Handles unresponsive components', function(done) {
            buddycloud.setDiscoveryTimeout(1)
            xmpp.once('stanza', function() {
                xmpp.on('stanza', function() {
                    // ...do nothing...
                })
                manager.makeCallback(helper.getStanza('disco-items'))
            })
            socket.send('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(item)
                error.should.equal('No buddycloud server found')
                done()
            })
        })

        it('Slow component reply doesn\'t callback() twice', function(done) {
            buddycloud.setDiscoveryTimeout(0)
            xmpp.on('stanza', function(stanza) {
                if (-1 !== stanza.toString().indexOf('disco#items')) {
                    manager.makeCallback(helper.getStanza('disco-items'))
                    setTimeout(function() {
                        done()
                    }, 3)
                }
                setTimeout(function() {
                    manager.makeCallback(helper.getStanza('disco-info'))
                }, 2)
            })
            socket.send('xmpp.buddycloud.discover', {}, function(error, item) {
                should.not.exist(item)
                error.should.equal('No buddycloud server found')
            })
        })

    })

    describe('Disco proxy', function() {

        it('Responses to disco#info events', function(done) {
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            var callback = function() {
                done()
            }
            socket.send('xmpp.buddycloud.discover.info', {}, callback)
        })

        it('Responds to disco#items events', function(done) {
            xmpp.once('stanza', function() {
                done('Unexpected outgoing stanza')
            })
            var callback = function() {
                done()
            }
            socket.send('xmpp.buddycloud.discover.items', {}, callback)
        })

    })

    it('Allows manual setting of channel server', function(done) {

        socket.send(
            'xmpp.buddycloud.discover',
            { server: 'channels.example.com' },
            function(error, item) {

            should.not.exist(error)
            item.should.equal('channels.example.com')
            buddycloud.channelServer.should.equal('channels.example.com')
            done()
        })
    })

})
