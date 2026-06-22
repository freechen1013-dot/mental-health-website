const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.weeklyCleanup = functions.pubsub.schedule('59 23 * * 7')
  .timeZone('Asia/Taipei')
  .onRun(async (context) => {
    const snapshot = await db.collection('posts')
      .where('isHonored', '==', false)
      .orderBy('likes', 'desc')
      .get();

    if (snapshot.empty) {
      console.log('No posts to process.');
      return null;
    }

    const posts = [];
    snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));

    const top3 = posts.slice(0, 3);
    const toDelete = posts.slice(3);

    const batch = db.batch();

    for (const post of top3) {
      batch.update(db.collection('posts').doc(post.id), {
        isHonored: true,
        status: 'honored'
      });
    }

    for (const post of toDelete) {
      const commentsSnapshot = await db.collection('comments')
        .where('postId', '==', post.id)
        .get();

      commentsSnapshot.forEach(commentDoc => {
        batch.delete(db.collection('comments').doc(commentDoc.id));
      });

      batch.delete(db.collection('posts').doc(post.id));
    }

    await batch.commit();
    console.log(`Weekly cleanup: ${top3.length} honored, ${toDelete.length} deleted.`);
    return null;
  });
