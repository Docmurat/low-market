import { redirect } from 'next/navigation';

/** Единственный раздел модерации сейчас — фото. */
export default function ModerIndexPage() {
  redirect('/moder/photos');
}
