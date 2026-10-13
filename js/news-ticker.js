
(function () {
  'use strict';

  var ROTATE_MS = 15000;

  var clockEl    = document.getElementById('news-clock');
  var dateEl     = document.getElementById('news-date');
  var storyEl    = document.getElementById('news-story');
  var titleEl    = document.getElementById('news-story-title');
  var descEl     = document.getElementById('news-story-desc');
  var dotsEl     = document.getElementById('news-dots');

  if (!clockEl || !storyEl) return;

  var articles    = [];
  var dots        = [];
  var articleIdx  = 0;
  var rotateTimer = null;

  function updateClock () {
    var now = new Date();
    var h = now.getHours();
    var m = String(now.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    clockEl.innerHTML = h12 + ':' + m + '<span class="clock-ampm">' + ampm + '</span>';

    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
  }
  updateClock();
  setInterval(updateClock, 10000);

  /*
   * The in-repo changelog is the evergreen copy: it ships with the site and is
   * reviewed in pull requests. Live announcements from the admin console are
   * layered on top of it, so an operator can push a notice without a deploy.
   */
  function loadNews () {
    return fetch('data/news.json')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.sections) return [];
        return json.sections.map(function (sec) {
          return (sec.articles || []).map(function (a) {
            return { title: a.title || '', desc: a.desc || '' };
          });
        });
      })
      .catch(function () { return []; });
  }

  function liveNotices () {
    try {
      if (window.PlutoniumNotices && typeof PlutoniumNotices.tickerItems === 'function') {
        return PlutoniumNotices.tickerItems();
      }
    } catch (err) { /* the ticker must never fail because of the control plane */ }
    return [];
  }

  /* Merge live notices ahead of the changelog, de-duplicated by title. */
  function mergeStories (sections) {
    var live = liveNotices();
    if (!live.length) return sections;
    var seen = {};
    var merged = live.concat(sections[0] || []).filter(function (story) {
      var key = (story.title || '').toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
    return [merged].concat(sections.slice(1));
  }

  function showStory (artIdx) {
    if (!articles.length) return;
    var next = ((artIdx % articles.length) + articles.length) % articles.length;
    articleIdx = next;
    var a = articles[next];

    storyEl.classList.add('slide-out');

    setTimeout(function () {
      titleEl.textContent = a.title;
      descEl.textContent  = a.desc;
      storyEl.style.transition = 'none';
      storyEl.classList.remove('slide-out');
      storyEl.classList.add('slide-in');
      void storyEl.offsetWidth;
      storyEl.style.transition = '';
      storyEl.classList.remove('slide-in');
      setActiveDot(next);
    }, 400);
  }

  function setActiveDot (idx) {
    dots.forEach(function (d, j) { d.classList.toggle('active', j === idx); });
  }

  function rotate () {
    showStory(articleIdx + 1);
  }

  function startRotation () {
    clearInterval(rotateTimer);
    rotateTimer = setInterval(rotate, ROTATE_MS);
  }

  function buildDots (count) {
    dotsEl.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('div');
      dot.className = 'news-dot' + (i === 0 ? ' active' : '');
      dotsEl.appendChild(dot);
    }
    return dotsEl.querySelectorAll('.news-dot');
  }

  function begin (sections) {
    if (!sections.length || !sections[0].length) return;
    articles = sections[0];
    dots = buildDots(articles.length);

    titleEl.textContent = articles[0].title;
    descEl.textContent  = articles[0].desc;

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        showStory(i);
        startRotation();
      });
    });

    startRotation();
  }

  loadNews().then(function (sections) {
    var merged = mergeStories(sections);
    begin(merged);

    // Notices arrive on their own schedule; refresh the strip when they do.
    if (window.PlutoniumNotices && typeof PlutoniumNotices.loadFeed === 'function') {
      PlutoniumNotices.loadFeed(false).then(function () {
        var updated = mergeStories(sections);
        if (!updated.length || !updated[0].length) return;
        if (updated[0].length !== articles.length) begin(updated);
      }).catch(function () {});
    }
  });
})();
