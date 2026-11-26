export default function Button({ Label, Press, Main }) {
  return (
    <button className="Button" data-kind={Main ? 'Main' : undefined} onClick={Press}>
      {Label}
    </button>
  )
}
