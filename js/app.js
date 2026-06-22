import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, increment, runTransaction, setDoc, getDoc, deleteDoc, where, Timestamp, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBqRvth7-D4KgMpDVefBGdHBWwGxRXBWTU",
  authDomain: "mental-health-website-bb5ab.firebaseapp.com",
  projectId: "mental-health-website-bb5ab",
  storageBucket: "mental-health-website-bb5ab.firebasestorage.app",
  messagingSenderId: "6815548805",
  appId: "1:6815548805:web:570ca59f82391dc478b0ec",
  measurementId: "G-JGQEMYJ395"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
getAnalytics(app);

const BLACKLIST = [
  { pattern: /\bkill\s+(yourself|urself|yourselfs|yourselves)\b/i, reason: "promotion of self-harm" },
  { pattern: /\bcommit\s+suicide\b/i, reason: "promotion of self-harm" },
  { pattern: /\bkys\b/i, reason: "promotion of self-harm" },
  { pattern: /\b(end|kill|destroy)\s+(your|my)\s+(life|existence)\b/i, reason: "promotion of self-harm" },
  { pattern: /\bhate?\s+(you|u|ya)\b/i, reason: "hate speech" },
  { pattern: /\byou\s+(should|need to|better)\s+(die|kill)\b/i, reason: "promotion of violence" },
  { pattern: /\bnazi\b/i, reason: "inappropriate content" },
  { pattern: /\b(rape|rapist|raped)\b/i, reason: "inappropriate content" },
  { pattern: /\b(murder|murderer|murdered|murdering)\b/i, reason: "promotion of violence" },
  { pattern: /\b(fuck|fck|f\*ck|f\*\*\*)\b/i, reason: "inappropriate language" },
  { pattern: /\bshit\b/i, reason: "inappropriate language" },
  { pattern: /\bbitch\b/i, reason: "hate speech" },
  { pattern: /\bcunt\b/i, reason: "hate speech" },
  { pattern: /\bnigg[aeu][rh]?\b/i, reason: "hate speech" },
  { pattern: /\b(asshole|a\*\*hole|a-hole)\b/i, reason: "inappropriate language" },
  { pattern: /\bdick\b/i, reason: "inappropriate language" },
  { pattern: /\bwhore\b/i, reason: "hate speech" },
  { pattern: /\bslut\b/i, reason: "hate speech" },
  { pattern: /\b(terrorist|terrorism)\b/i, reason: "inappropriate content" },
  { pattern: /\bbomb\s+(school|place|office|building)\b/i, reason: "promotion of violence" },
  { pattern: /\b(self.?harm|self.?hurt)\b/i, reason: "promotion of self-harm" },
  { pattern: /\bcut\s+(yourself|my\s+(wrist|arm|skin))\b/i, reason: "promotion of self-harm" },
  { pattern: /\b(noose|hang\s+myself|hang\s+yourself)\b/i, reason: "promotion of self-harm" },
];

const MIN_POST_WORDS = 5;
const MIN_COMMENT_CHARS = 1;

let allPosts = [];
let allComments = [];
let currentView = 'recent';
let expandedState = {};
let pendingSubmission = null;

const commentsContainer = document.getElementById('commentsContainer');
const emptyState = document.getElementById('emptyState');
const postAuthor = document.getElementById('postAuthor');
const postContent = document.getElementById('postContent');
const postCommentsToggle = document.getElementById('postCommentsToggle');
const postSubmitBtn = document.getElementById('postSubmitBtn');
const viewRecent = document.getElementById('viewRecent');
const viewHonored = document.getElementById('viewHonored');

const overlay = document.getElementById('overlay');
const confirmDialog = document.getElementById('confirmDialog');
const confirmContinue = document.getElementById('confirmContinue');
const confirmClose = document.getElementById('confirmClose');
const dialogPreview = document.getElementById('dialogPreview');
const warningDialog = document.getElementById('warningDialog');
const warningMessage = document.getElementById('warningMessage');
const warningClose = document.getElementById('warningClose');
const successDialog = document.getElementById('successDialog');
const successMessage = document.getElementById('successMessage');
const successClose = document.getElementById('successClose');

function showDialog(dialog) {
  overlay.classList.remove('hidden');
  dialog.classList.remove('hidden');
}

function hideAllDialogs() {
  overlay.classList.add('hidden');
  confirmDialog.classList.add('hidden');
  warningDialog.classList.add('hidden');
  successDialog.classList.add('hidden');
}

overlay.addEventListener('click', hideAllDialogs);
confirmClose.addEventListener('click', hideAllDialogs);
warningClose.addEventListener('click', hideAllDialogs);
successClose.addEventListener('click', hideAllDialogs);

function countMeaningfulWords(text) {
  return text.split(/\s+/).filter(t => {
    const cleaned = t.replace(/[^\w']/g, '');
    return cleaned.length >= 2 && /[a-zA-Z]/.test(cleaned);
  }).length;
}

function getMeaningfulChars(text) {
  return text.replace(/[\s\p{So}\p{Sk}]/gu, '').length;
}

function checkBlacklist(text) {
  for (const item of BLACKLIST) {
    const match = text.match(item.pattern);
    if (match) {
      return { matched: match[0], reason: item.reason };
    }
  }
  return null;
}

function getLikeKey(type, id) {
  return `liked_${type}_${id}`;
}

function isLiked(type, id) {
  return localStorage.getItem(getLikeKey(type, id)) === 'true';
}

function toggleLikeState(type, id) {
  const key = getLikeKey(type, id);
  const current = localStorage.getItem(key) === 'true';
  localStorage.setItem(key, current ? 'false' : 'true');
  return !current;
}

function getStoredLikedPosts() {
  const liked = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('liked_post_') && localStorage.getItem(key) === 'true') {
      liked[key.replace('liked_post_', '')] = true;
    }
    if (key.startsWith('liked_comment_') && localStorage.getItem(key) === 'true') {
      liked[key.replace('liked_comment_', '')] = true;
    }
  }
  return liked;
}

async function handleLike(type, id) {
  const nowLiked = toggleLikeState(type, id);
  const docRef = doc(db, type === 'post' ? 'posts' : 'comments', id);
  await updateDoc(docRef, {
    likes: increment(nowLiked ? 1 : -1)
  });
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderPosts() {
  const filtered = currentView === 'recent'
    ? allPosts.filter(p => !p.isHonored)
    : allPosts.filter(p => p.isHonored);

  if (filtered.length === 0) {
    commentsContainer.innerHTML = `
      <div class="empty-state">
        <p>There's no comment yet, go ahead and bring your experience here!</p>
        <span class="flower-empty">✿</span>
      </div>`;
    return;
  }

  let html = '';
  for (const post of filtered) {
    const liked = isLiked('post', post.id);
    const isExpanded = expandedState[post.id] || false;
    const postComments = allComments.filter(c => c.postId === post.id);

    html += `
      <div class="post-card" data-post-id="${post.id}">
        <div class="post-header">
          <span class="post-author">${escapeHtml(post.author)}${post.isHonored ? '<span class="post-badge">★ Honored</span>' : ''}</span>
          <span class="post-number">${post.postNumber || ''}</span>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
          <button class="action-btn like-btn ${liked ? 'liked' : ''}" data-type="post" data-id="${post.id}">
            <svg class="heart-icon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
          ${post.commentsEnabled ? `
            <button class="action-btn toggle-comments-btn" data-post-id="${post.id}">
              <svg class="comment-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              ${isExpanded ? 'Hide Comments' : 'Show Comments'}
            </button>
          ` : ''}
        </div>
        ${post.commentsEnabled && isExpanded ? `
          <div class="comments-thread">
            ${postComments.length === 0 ? '<p style="color:#aaa;font-size:0.85rem;text-align:center;padding:8px 0;">No comments yet.</p>' : ''}
            ${postComments.map(c => `
              <div class="comment-item" data-comment-id="${c.id}">
                <div class="comment-header">
                  <span class="comment-author">${escapeHtml(c.author)}</span>
                  <span class="comment-number">${c.commentNumber || ''}</span>
                </div>
                <div class="comment-content">${escapeHtml(c.content)}</div>
                <div class="comment-actions">
                  <button class="action-btn like-btn ${isLiked('comment', c.id) ? 'liked' : ''}" data-type="comment" data-id="${c.id}">
                    <svg class="heart-icon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
            <div class="comment-form">
              <input type="text" class="comment-author-input" placeholder="Your nickname" maxlength="30">
              <textarea class="comment-content-input" placeholder="Write a comment..." rows="2"></textarea>
              <button class="btn-primary submit-comment-btn" data-post-id="${post.id}">Submit</button>
            </div>
          </div>
        ` : ''}
      </div>`;
  }

  commentsContainer.innerHTML = html;

  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const id = btn.dataset.id;
      try {
        await handleLike(type, id);
        btn.classList.toggle('liked');
      } catch (e) {
        console.error('Like error:', e);
      }
    });
  });

  document.querySelectorAll('.toggle-comments-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.dataset.postId;
      expandedState[postId] = !expandedState[postId];
      renderPosts();
    });
  });

  document.querySelectorAll('.submit-comment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.dataset.postId;
      const form = btn.closest('.comment-form');
      const authorInput = form.querySelector('.comment-author-input');
      const contentInput = form.querySelector('.comment-content-input');
      handleCommentSubmit(postId, authorInput, contentInput);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function getNextPostNumber() {
  const counterRef = doc(db, 'counters', 'postCounter');
  try {
    const result = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextNum = 1;
      if (counterDoc.exists()) {
        nextNum = counterDoc.data().currentNumber + 1;
      }
      transaction.set(counterRef, { currentNumber: nextNum }, { merge: true });
      return nextNum;
    });
    return result;
  } catch (e) {
    console.error('Counter error:', e);
    return Date.now();
  }
}

async function getNextCommentNumber(postId, postNumber) {
  const counterRef = doc(db, 'counters', `commentCounter_${postId}`);
  try {
    const result = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextNum = 1;
      if (counterDoc.exists()) {
        nextNum = counterDoc.data().currentNumber + 1;
      }
      transaction.set(counterRef, { currentNumber: nextNum }, { merge: true });
      return `${postNumber}-${nextNum}`;
    });
    return result;
  } catch (e) {
    console.error('Comment counter error:', e);
    return `${postNumber}-x`;
  }
}

async function handlePostSubmit() {
  const author = postAuthor.value.trim();
  const content = postContent.value.trim();
  const commentsEnabled = postCommentsToggle.checked;

  if (!author) {
    showWarning('Please enter a nickname.');
    return;
  }
  if (!content) {
    showWarning('Please write something about your experience.');
    return;
  }

  const wordCount = countMeaningfulWords(content);
  if (wordCount < MIN_POST_WORDS) {
    showWarning('The content you wrote doesn\'t contain enough meaningful information. Try to give more complete explanation?');
    return;
  }

  const blacklistCheck = checkBlacklist(content);
  if (blacklistCheck) {
    showWarning(`Your usage of the word/sentence "${blacklistCheck.matched}" may contain ${blacklistCheck.reason}. Please change a topic to say/way of saying it.`);
    return;
  }

  pendingSubmission = { author, content, commentsEnabled };
  dialogPreview.textContent = `${author}: ${content}`;
  showDialog(confirmDialog);
}

confirmContinue.addEventListener('click', async () => {
  if (!pendingSubmission) return;
  hideAllDialogs();

  const { author, content, commentsEnabled } = pendingSubmission;
  pendingSubmission = null;

  try {
    const postNumber = await getNextPostNumber();
    await addDoc(collection(db, 'posts'), {
      author,
      content,
      commentsEnabled,
      likes: 0,
      postNumber,
      isHonored: false,
      createdAt: Timestamp.now()
    });

    successMessage.textContent = 'Content successfully sent!';
    showDialog(successDialog);
    postAuthor.value = '';
    postContent.value = '';
    postCommentsToggle.checked = true;
  } catch (e) {
    console.error('Submit error:', e);
    showWarning('Something went wrong. Please try again.');
  }
});

async function handleCommentSubmit(postId, authorInput, contentInput) {
  const author = authorInput.value.trim();
  const content = contentInput.value.trim();

  if (!author) {
    showWarning('Please enter a nickname.');
    return;
  }
  if (!content || getMeaningfulChars(content) < MIN_COMMENT_CHARS) {
    showWarning('Please write a comment.');
    return;
  }

  const blacklistCheck = checkBlacklist(content);
  if (blacklistCheck) {
    showWarning(`Your usage of the word/sentence "${blacklistCheck.matched}" may contain ${blacklistCheck.reason}. Please change a topic to say/way of saying it.`);
    return;
  }

  const post = allPosts.find(p => p.id === postId);
  if (!post) return;

  try {
    const commentNumber = await getNextCommentNumber(postId, post.postNumber);
    await addDoc(collection(db, 'comments'), {
      postId,
      author,
      content,
      likes: 0,
      commentNumber,
      createdAt: Timestamp.now()
    });

    successMessage.textContent = 'Content successfully sent!';
    showDialog(successDialog);
    authorInput.value = '';
    contentInput.value = '';
  } catch (e) {
    console.error('Comment submit error:', e);
    showWarning('Something went wrong. Please try again.');
  }
}

function showWarning(msg) {
  warningMessage.textContent = msg;
  showDialog(warningDialog);
}

postSubmitBtn.addEventListener('click', handlePostSubmit);

viewRecent.addEventListener('click', () => {
  currentView = 'recent';
  viewRecent.classList.add('active');
  viewHonored.classList.remove('active');
  renderPosts();
});

viewHonored.addEventListener('click', () => {
  currentView = 'honored';
  viewHonored.classList.add('active');
  viewRecent.classList.remove('active');
  renderPosts();
});

const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
const commentsQuery = query(collection(db, 'comments'), orderBy('createdAt', 'asc'));

onSnapshot(postsQuery, (snapshot) => {
  allPosts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  renderPosts();
});

onSnapshot(commentsQuery, (snapshot) => {
  allComments = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  if (Object.keys(expandedState).length > 0) {
    renderPosts();
  }
});
