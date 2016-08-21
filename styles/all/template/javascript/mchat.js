/**
 *
 * @package phpBB Extension - mChat
 * @copyright (c) 2009 By Shapoval Andrey Vladimirovich (AllCity) ~ http://allcity.net.ru/
 * @copyright (c) 2013 By Rich McGirr (RMcGirr83) http://rmcgirr83.org
 * @copyright (c) 2015 By dmzx - http://www.dmzx-web.net
 * @copyright (c) 2016 By kasimi
 * @license http://opensource.org/licenses/gpl-license.php GNU Public License
 *
 */

// Support Opera
if (typeof document.hasFocus === 'undefined') {
	document.hasFocus = function() {
		return document.visibilityState == 'visible';
	};
}

if (!Array.prototype.max) {
	Array.prototype.max = function() {
		return Math.max.apply(null, this);
	};
}

if (!Array.prototype.min) {
	Array.prototype.min = function() {
		return Math.min.apply(null, this);
	};
}

Array.prototype.removeValue = function(value) {
	var index = -1;
	var elementsRemoved = 0;
	while ((index = this.indexOf(value)) !== -1) {
		this.splice(index, 1);
		elementsRemoved++;
	}
	return elementsRemoved;
};

String.prototype.format = function() {
	var str = this.toString();
	if (!arguments.length) {
		return str;
	}
	var type = typeof arguments[0];
	var args = 'string' == type || 'number' == type ? arguments : arguments[0];
	for (var arg in args) {
		if (args.hasOwnProperty(arg)) {
			str = str.replace(new RegExp("\\{" + arg + "\\}", "gi"), args[arg]);
		}
	}
	return str;
};

String.prototype.replaceMany = function() {
	var result = this;
	var args = arguments[0];
	for (var arg in args) {
		if (args.hasOwnProperty(arg)) {
			result = result.replace(new RegExp(RegExp.escape(arg), "g"), args[arg]);
		}
	}
	return result;
};

RegExp.escape = function(s) {
	return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

jQuery.fn.reverse = function(reverse) {
	return reverse === 'undefined' || reverse ? jQuery(this.toArray().reverse()) : this;
};

jQuery(function($) {

	"use strict";

	$.extend(mChat, {
		ajaxRequest: function(mode, sendHiddenFields, data) {
			var deferred = $.Deferred();
			if (sendHiddenFields) {
				$.extend(data, mChat.hiddenFields);
			}
			$(mChat).trigger('mchat_send_request_before', [mode, data]);
			$.ajax({
				url: mChat.actionUrls[mode],
				timeout: Math.min(mChat.refreshTime, 10000),
				type: 'POST',
				dataType: 'json',
				data: data
			}).done(function(json, status, xhr) {
				var data = {
					mode: mode,
					json: json,
					status: status,
					xhr: xhr,
					handle: true
				};
				$(mChat).trigger('mchat_ajax_done_before', [data]);
				if (data.handle) {
					if (json[mode]) {
						deferred.resolve(data.json, data.status, data.xhr);
					} else {
						deferred.reject(data.xhr, data.status, mChat.parserErr);
					}
				}
			}).fail(function(xhr, status, error) {
				deferred.reject(xhr, status, error);
			});
			return deferred.promise().fail(function(xhr, textStatus, errorThrown) {
				if (mChat.pageIsUnloading) {
					return;
				}
				if (typeof console !== 'undefined' && console.log) {
					console.log('AJAX error. status: ' + textStatus + ', message: ' + errorThrown + ' (' + xhr.responseText + ')');
				}
				var data = {
					mode: mode,
					xhr: xhr,
					textStatus: textStatus,
					errorThrown: errorThrown,
					updateSession: function(xhr) {
						if (xhr.status == 403) {
							mChat.endSession(true);
						} else if (xhr.status == 400) {
							mChat.resetSession();
						}
					}
				};
				$(mChat).trigger('mchat_ajax_fail_before', [data]);
				mChat.sound('error');
				mChat.cached('status-load', 'status-ok', 'status-paused').hide();
				mChat.cached('status-error').show();
				var responseText;
				try {
					responseText = xhr.responseJSON.message || errorThrown;
				} catch (e) {
					responseText = errorThrown;
				}
				phpbb.alert(mChat.err, responseText);
				data.updateSession(data.xhr);
			});
		},
		sound: function(file) {
			if (!mChat.pageIsUnloading && !localStorage.getItem(mChat.cookie + 'mchat_no_sound')) {
				var data = {
					audio: mChat.cached('sound-' + file).get(0),
					file: file,
					play: true
				};
				$(mChat).trigger('mchat_sound_before', [data]);
				if (data.play && data.audio.duration) {
					data.audio.pause();
					data.audio.currentTime = 0;
					data.audio.play();
				}
			}
		},
		titleAlert: function() {
			var data = {
				doAlert: !document.hasFocus(),
				interval: 1000
			};
			$(mChat).trigger('mchat_titlealert_before', [data]);
			if (data.doAlert) {
				$.titleAlert(mChat.newMessageAlert, data);
			}
		},
		toggle: function(name) {
			var $elem = mChat.cached(name);
			$elem.stop().slideToggle(function() {
				if ($elem.is(':visible')) {
					localStorage.setItem(mChat.cookie + 'mchat_show_' + name, 'yes');
				} else {
					localStorage.removeItem(mChat.cookie + 'mchat_show_' + name);
				}
			});
		},
		confirm: function(data) {
			var $confirmFields = data.container.find('.mchat-confirm-fields');
			$confirmFields.children().hide();
			var fields = data.fields($confirmFields);
			$.each(fields, function() {
				$(this).show();
			});
			setTimeout(function() {
				var $input = $confirmFields.find(':input:visible:enabled:first');
				if ($input.length) {
					var value = $input.val();
					$input.focus().val('').val(value);
				}
			}, 1);
			phpbb.confirm(data.container.show(), function() {
				if (typeof data.confirm === 'function') {
					data.confirm.apply(this, fields);
				}
			});
		},
		add: function() {
			if (mChat.cached('add').prop('disabled')) {
				return;
			}
			var messageLength = mChat.inputMessageLength();
			if (!messageLength) {
				phpbb.alert(mChat.err, mChat.noMessageInput);
				return;
			}
			if (mChat.mssgLngth && messageLength > mChat.mssgLngth) {
				phpbb.alert(mChat.err, mChat.mssgLngthLong);
				return;
			}
			mChat.cached('add').prop('disabled', true);
			mChat.pauseSession();
			var inputValue = mChat.cached('input').val();
			var originalInputValue = inputValue;
			var color = localStorage.getItem(mChat.cookie + 'mchat_color');
			if (color && inputValue.indexOf('[color=') === -1) {
				inputValue = '[color=#' + color + '] ' + inputValue + ' [/color]';
			}
			mChat.cached('input').val('');
			mChat.refresh(inputValue).done(function() {
				mChat.resetSession();
			}).fail(function() {
				mChat.cached('input').val(originalInputValue);
			}).always(function() {
				mChat.cached('add').prop('disabled', false);
				setTimeout(function() {
					mChat.cached('input').focus();
				}, 1);
			});
		},
		edit: function() {
			var $message = $(this).closest('.mchat-message');
			mChat.confirm({
				container: mChat.cached('confirm'),
				fields: function($container) {
					return [
						$container.find('p').text(mChat.editInfo),
						$container.find('textarea').val($message.data('mchat-message'))
					];
				},
				confirm: function($p, $textarea) {
					mChat.ajaxRequest('edit', true, {
						message_id: $message.data('mchat-id'),
						message: $textarea.val(),
						archive: mChat.archivePage ? 1 : 0
					}).done(function(json) {
						mChat.updateMessages($(json.edit));
						mChat.resetSession();
					});
				}
			});
		},
		del: function() {
			var delId = $(this).closest('.mchat-message').data('mchat-id');
			mChat.confirm({
				container: mChat.cached('confirm'),
				fields: function($container) {
					return [
						$container.find('p').text(mChat.delConfirm)
					];
				},
				confirm: function($p) {
					mChat.ajaxRequest('del', true, {
						message_id: delId
					}).done(function() {
						mChat.removeMessages([delId]);
						mChat.resetSession();
					});
				}
			});
		},
		refresh: function(message) {
			if (mChat.isPaused && !message) {
				return false;
			}
			var data = {
				last: mChat.messageIds.length ? mChat.messageIds.max() : 0
			};
			if (message) {
				data.message = message;
			}
			if (mChat.liveUpdates) {
				data.log = mChat.logId;
			}
			mChat.cached('status-ok', 'status-error', 'status-paused').hide();
			mChat.cached('status-load').show();
			return mChat.ajaxRequest(message ? 'add' : 'refresh', !!message, data).done(function(json) {
				$(mChat).trigger('mchat_response_handle_data_before', [json]);
				if (json.add) {
					mChat.addMessages($(json.add));
				}
				if (json.edit) {
					mChat.updateMessages($(json.edit));
				}
				if (json.del) {
					mChat.removeMessages(json.del);
				}
				if (json.whois) {
					mChat.handleWhoisResponse(json);
				}
				if (json.log) {
					mChat.logId = json.log;
				}
				if (mChat.refreshInterval) {
					mChat.cached('status-load', 'status-error', 'status-paused').hide();
					mChat.cached('status-ok').show();
				}
				$(mChat).trigger('mchat_response_handle_data_after', [json]);
			});
		},
		whois: function() {
			if (mChat.customPage) {
				mChat.cached('refresh-pending').show();
				mChat.cached('refresh-explain').hide();
			}
			mChat.ajaxRequest('whois', false, {}).done(mChat.handleWhoisResponse);
		},
		handleWhoisResponse: function(json) {
			var $whois = $(json.whois);
			var $userlist = $whois.find('#mchat-userlist');
			if (localStorage.getItem(mChat.cookie + 'mchat_show_userlist')) {
				$userlist.show();
			}
			mChat.cached('whois').replaceWith($whois);
			mChat.cache.whois = $whois;
			mChat.cache.userlist = $userlist;
			if (mChat.customPage) {
				mChat.cached('refresh-pending').hide();
				mChat.cached('refresh-explain').show();
			}
			if (json.navlink) {
				$('.mchat-nav-link').html(json.navlink);
			}
			if (json.navlink_title) {
				$('.mchat-nav-link-title').prop('title', json.navlink_title);
			}
		},
		addMessages: function($messages) {
			var playSound = true;
			mChat.cached('messages').find('.mchat-no-messages').remove();
			$messages.reverse(mChat.messageTop).hide().each(function(i) {
				var $message = $(this);
				var data = {
					message: $message,
					delay: mChat.refreshInterval ? 400 : 0,
					abort: $.inArray($message.data('mchat-id'), mChat.messageIds) !== -1,
					playSound: playSound
				};
				$(mChat).trigger('mchat_add_message_before', [data]);
				if (data.abort) {
					return;
				}
				if (data.playSound) {
					mChat.sound('add');
					mChat.titleAlert();
					playSound = false;
				}
				mChat.messageIds.push($message.data('mchat-id'));
				setTimeout(function() {
					var $container = mChat.cached('messages');
					var scrollHeight = $container.get(0).scrollHeight;
					var data = {
						container: $container,
						message: $message,
						add: function($container, $message) {
							if (mChat.messageTop) {
								$container.prepend($message);
							} else {
								$container.append($message);
							}
						},
						show: function($message) {
							$message.css('opacity', 0).slideDown().animate({opacity: 1}, {queue: false});
						},
						scroll: function($container) {
							if (!mChat.messageTop && $container.scrollTop() >= scrollHeight - $container.height()) {
								$container.animate({
									scrollTop: scrollHeight,
									easing: 'swing',
									duration: 'slow'
								});
							}
						}
					};
					$(mChat).trigger('mchat_add_message_animate_before', [data]);
					data.add(data.container, data.message);
					data.show(data.message);
					data.scroll(data.container);
				}, i * data.delay);
				if (mChat.editDeleteLimit && $message.data('mchat-edit-delete-limit') && $message.find('[data-mchat-action="edit"], [data-mchat-action="del"]').length > 0) {
					var id = $message.prop('id');
					setTimeout(function() {
						$('#' + id).find('[data-mchat-action="edit"], [data-mchat-action="del"]').fadeOut(function() {
							$(this).closest('li').remove();
						});
					}, mChat.editDeleteLimit);
				}
				mChat.startRelativeTimeUpdate($message);
			});
		},
		updateMessages: function($messages) {
			var playSound = true;
			$messages.each(function() {
				var $newMessage = $(this);
				var data = {
					newMessage: $newMessage,
					oldMessage: $('#mchat-message-' + $newMessage.data('mchat-id')),
					playSound: playSound
				};
				$(mChat).trigger('mchat_edit_message_before', [data]);
				mChat.stopRelativeTimeUpdate(data.oldMessage);
				mChat.startRelativeTimeUpdate(data.newMessage);
				data.oldMessage.fadeOut(function() {
					data.oldMessage.replaceWith(data.newMessage.hide().fadeIn());
				});
				if (data.playSound) {
					mChat.sound('edit');
					playSound = false;
				}
			});
		},
		removeMessages: function(ids) {
			var playSound = true;
			$.each(ids, function(i, id) {
				if (mChat.messageIds.removeValue(id)) {
					var data = {
						id: id,
						message: $('#mchat-message-' + id),
						playSound: playSound
					};
					$(mChat).trigger('mchat_delete_message_before', [data]);
					mChat.stopRelativeTimeUpdate(data.message);
					(function($message) {
						$message.fadeOut(function() {
							$message.remove();
						});
					})(data.message);
					if (data.playSound) {
						mChat.sound('del');
						playSound = false;
					}
				}
			});
		},
		startRelativeTimeUpdate: function($messages) {
			if (mChat.relativeTime) {
				$messages.find('.mchat-time[data-mchat-relative-update]').each(function() {
					var $time = $(this);
					setTimeout(function() {
						mChat.relativeTimeUpdate($time);
						$time.data('mchat-relative-interval', setInterval(function() {
							mChat.relativeTimeUpdate($time);
						}, 60 * 1000));
					}, $time.data('mchat-relative-update') * 1000);
				});
			}
		},
		relativeTimeUpdate: function($time) {
			var minutesAgo = $time.data('mchat-minutes-ago') + 1;
			var langMinutesAgo = mChat.minutesAgo[minutesAgo];
			if (langMinutesAgo) {
				$time.text(langMinutesAgo).data('mchat-minutes-ago', minutesAgo);
			} else {
				mChat.stopRelativeTimeUpdate($time);
				$time.text($time.attr('title')).removeAttr('data-mchat-relative-update data-mchat-minutes-ago data-mchat-relative-interval');
			}
		},
		stopRelativeTimeUpdate: function($message) {
			var selector = '.mchat-time[data-mchat-relative-update]';
			clearInterval($message.find(selector).addBack(selector).data('mchat-relative-interval'));
		},
		timeLeft: function(sessionTime) {
			return (new Date(sessionTime * 1000)).toUTCString().match(/(\d\d:\d\d:\d\d)/)[0];
		},
		countDown: function() {
			mChat.sessionTime -= 1;
			mChat.cached('session').html(mChat.sessEnds.format({timeleft: mChat.timeLeft(mChat.sessionTime)}));
			if (mChat.sessionTime < 1) {
				mChat.endSession();
			}
		},
		pauseSession: function() {
			clearInterval(mChat.refreshInterval);
			if (mChat.timeout) {
				clearInterval(mChat.sessionCountdown);
			}
			if (mChat.whoisRefresh) {
				clearInterval(mChat.whoisInterval);
			}
		},
		resetSession: function() {
			if (!mChat.archivePage) {
				clearInterval(mChat.refreshInterval);
				mChat.refreshInterval = setInterval(mChat.refresh, mChat.refreshTime);
				if (mChat.timeout) {
					mChat.sessionTime = mChat.timeout / 1000;
					clearInterval(mChat.sessionCountdown);
					mChat.cached('session').html(mChat.sessEnds.format({timeleft: mChat.timeLeft(mChat.sessionTime)}));
					mChat.sessionCountdown = setInterval(mChat.countDown, 1000);
				}
				if (mChat.whoisRefresh) {
					clearInterval(mChat.whoisInterval);
					mChat.whoisInterval = setInterval(mChat.whois, mChat.whoisRefresh);
				}
				mChat.cached('status-ok').show();
				mChat.cached('status-load', 'status-error', 'status-paused').hide();
				mChat.cached('refresh-text').html(mChat.refreshYes);
			}
		},
		endSession: function(skipUpdateWhois) {
			clearInterval(mChat.refreshInterval);
			mChat.refreshInterval = false;
			if (mChat.timeout) {
				clearInterval(mChat.sessionCountdown);
				mChat.cached('session').html(mChat.sessOut);
			}
			if (mChat.whoisRefresh) {
				clearInterval(mChat.whoisInterval);
				if (!skipUpdateWhois) {
					mChat.whois();
				}
			}
			mChat.cached('status-load', 'status-ok', 'status-error').hide();
			mChat.cached('status-paused').show();
			mChat.cached('refresh-text').html(mChat.refreshNo);
		},
		pauseStart: function() {
			mChat.isPaused = true;
			mChat.cached('refresh-text').html(mChat.refreshNo);
			mChat.cached('status-load', 'status-ok', 'status-error').hide();
			mChat.cached('status-paused').show();
		},
		pauseEnd: function() {
			mChat.cached('refresh-text').html(mChat.refreshYes);
			mChat.cached('status-load', 'status-error', 'status-paused').hide();
			mChat.cached('status-ok').show();
			mChat.isPaused = false;
		},
		mention: function() {
			var $container = $(this).closest('.mchat-message');
			var username = $container.data('mchat-username');
			var usercolor = $container.data('mchat-usercolor');
			if (usercolor) {
				username = '[b][color=' + usercolor + ']' + username + '[/color][/b]';
			} else if (mChat.allowBBCodes) {
				username = '[b]' + username + '[/b]';
			}
			insert_text('@ ' + username + ', ');
		},
		quote: function() {
			var $container = $(this).closest('.mchat-message');
			var username = $container.data('mchat-username');
			var quote = $container.data('mchat-message');
			insert_text('[quote="' + username + '"] ' + quote + '[/quote]');
		},
		like: function() {
			var $container = $(this).closest('.mchat-message');
			var username = $container.data('mchat-username');
			var quote = $container.data('mchat-message');
			insert_text(mChat.likes + '[quote="' + username + '"] ' + quote + '[/quote]');
		},
		ip: function() {
			popup(this.href, 750, 500);
		},
		bbCodeRegex: /\[\/?[^\[\]]+\]/g,
		inputMessageLength: function() {
			return $.trim(mChat.cached('input').val()).replace(mChat.bbCodeRegex, '').length;
		},
		cached: function() {
			return $($.map(arguments, function(name) {
				if (!mChat.cache[name]) {
					mChat.cache[name] = $('#mchat-' + name);
				}
				return mChat.cache[name];
			})).map(function() {
				return this.toArray();
			});
		}
	});

	mChat.cache = {};
	mChat.messageIds = mChat.cached('messages').children().map(function() {
		return $(this).data('mchat-id');
	}).get();

	mChat.hiddenFields = {};
	mChat.cached('form').find('input[type=hidden]').each(function() {
		mChat.hiddenFields[this.name] = this.value;
	});

	mChat.isPaused = false;

	if (!mChat.archivePage) {
		mChat.resetSession();

		if (!mChat.messageTop) {
			mChat.cached('messages').animate({scrollTop: mChat.cached('messages')[0].scrollHeight, easing: 'swing', duration: 'slow'});
		}

		mChat.cached('user-sound').prop('checked', mChat.playSound && !localStorage.getItem(mChat.cookie + 'mchat_no_sound')).change(function() {
			if (this.checked) {
				localStorage.removeItem(mChat.cookie + 'mchat_no_sound');
			} else {
				localStorage.setItem(mChat.cookie + 'mchat_no_sound', 'yes');
			}
		}).change();

		$.each(mChat.removeBBCodes.split('|'), function(i, bbcode) {
			var bbCodeClass = '.bbcode-' + bbcode.replaceMany({
				'=': '-',
				'*': 'asterisk'
			});
			$('#format-buttons').find(bbCodeClass).remove();
		});

		var $colourPalette = $('#colour_palette');
		$colourPalette.appendTo($colourPalette.parent()).wrap('<div id="mchat-colour"></div>').show();
		$('#bbpalette,#abbc3_bbpalette').prop('onclick', null).attr('data-mchat-toggle', 'colour');

		$.each(['userlist', 'smilies', 'bbcodes', 'colour'], function(i, elem) {
			if (localStorage.getItem(mChat.cookie + 'mchat_show_' + elem)) {
				mChat.cached(elem).toggle();
			}
		});

		mChat.isTextarea = mChat.cached('input').is('textarea');
		mChat.cached('form').submit(function(e){
			e.preventDefault();
		}).keypress(function(e) {
			if ((e.which == 10 || e.which == 13) && (!mChat.isTextarea || e.ctrlKey || e.metaKey) && mChat.cached('input').is(e.target)) {
				mChat.add();
			}
		});

		if (mChat.pause) {
			mChat.cached('form').keyup(function(e) {
				if (mChat.refreshInterval !== false) {
					var val = mChat.cached('input').val();
					if (mChat.isPaused && val === '') {
						mChat.pauseEnd();
					} else if (!mChat.isPaused && val !== '') {
						mChat.pauseStart();
					}
				}
			});
		}

		if (mChat.showCharCount) {
			mChat.cached('form').keyup(function(e) {
				var count = mChat.inputMessageLength();
				var $elem = mChat.cached('character-count').html(mChat.charCount.format({current: count, max: mChat.mssgLngth})).toggleClass('hidden', count === 0);
				if (mChat.mssgLngth) {
					$elem.toggleClass('error', count > mChat.mssgLngth);
				}
			});
		}

		mChat.cached('input').autogrow({
			vertical: false,
			horizontal: true
		});
	}

	mChat.startRelativeTimeUpdate(mChat.cached('messages'));

	$(window).on('beforeunload', function() {
		mChat.pageIsUnloading = true;
	});

	mChat.cached('colour').find('.colour-palette').on('click', 'a', function(e) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			e.stopImmediatePropagation();
			var $this = $(this);
			var newColor = $this.data('color');
			if (localStorage.getItem(mChat.cookie + 'mchat_color') === newColor) {
				localStorage.removeItem(mChat.cookie + 'mchat_color');
			} else {
				localStorage.setItem(mChat.cookie + 'mchat_color', newColor);
				mChat.cached('colour').find('.colour-palette a').removeClass('remember-color');
			}
			$this.toggleClass('remember-color');
		}
	});

	var color = localStorage.getItem(mChat.cookie + 'mchat_color');
	if (color) {
		mChat.cached('colour').find('.colour-palette a[data-color="' + color + '"]').addClass('remember-color');
	}

	$('#phpbb').on('click', '[data-mchat-action]', function(e) {
		e.preventDefault();
		var action = $(this).data('mchat-action');
		mChat[action].call(this);
	}).on('click', '[data-mchat-toggle]', function(e) {
		e.preventDefault();
		var elem = $(this).data('mchat-toggle');
		mChat.toggle(elem);
	});
});
