// Devuelve "id" en lugar de "_id" y oculta "__v" en las respuestas JSON.
export function cleanJSON(schema) {
  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    }
  });
}
