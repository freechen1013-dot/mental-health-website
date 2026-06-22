const admin = require('firebase-admin');

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runCleanup() {
  const snapshot = await db.collection('posts')
    .where('isHonored', '==', false)
    .orderBy('likes', 'desc')
    .get();

  if (snapshot.empty) {
    console.log('No posts to process.');
    process.exit(0);
  }

  const posts = [];
  snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
  console.log(`Found ${posts.length} non-honored posts.`);

  const top3 = posts.slice(0, 3);
  const toDelete = posts.slice(3);

  const batch = db.batch();

  for (const post of top3) {
    batch.update(db.collection('posts').doc(post.id), {
      isHonored: true,
      status: 'honored'
    });
    console.log(`Honored post #${post.postNumber} (${post.likes || 0} likes): "${post.content?.slice(0, 50)}..."`);
  }

  for (const post of toDelete) {
    const commentsSnapshot = await db.collection('comments')
      .where('postId', '==', post.id)
      .get();

    commentsSnapshot.forEach(commentDoc => {
      batch.delete(db.collection('comments').doc(commentDoc.id));
    });

    batch.delete(db.collection('posts').doc(post.id));
    console.log(`Deleted post #${post.postNumber} with ${commentsSnapshot.size} comment(s).`);
  }

  await batch.commit();
  console.log(`Done: ${top3.length} honored, ${toDelete.length} deleted.`);
}

runCleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
