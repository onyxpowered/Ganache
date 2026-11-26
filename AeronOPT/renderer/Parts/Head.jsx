export default function Head({ Dot, Label }) {
  return (
    <header className="Head">
      <span className="Word">AeronX</span>
      <div className="State">
        <span className="Dot" data-state={Dot} />
        {Label}
      </div>
    </header>
  )
}
