// Commit a state change and its audit outbox event in the same subscription update.
// An interrupted audit write is resumed by the next billing read or operator command.
export async function flushBillingAudit({ subscriptions, billingAudit }, spaceId) {
  const record = await subscriptions.findOne({ spaceId }, { projection: { auditOutbox: 1 } });
  for (const event of record?.auditOutbox ?? []) {
    try {
      await billingAudit.updateOne({ _id: event._id }, { $setOnInsert: event }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    await subscriptions.updateOne({ spaceId }, { $pull: { auditOutbox: { _id: event._id } } });
  }
}
