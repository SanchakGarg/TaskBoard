export function About() {
  return (
    <div className="graph-paper min-h-screen p-8 flex justify-center">
      <div className="max-w-3xl w-full bg-paper p-8 rounded-xl shadow-sm border border-ink/10">
        <h1 className="text-3xl font-bold mb-6 font-hand">About Taskboard</h1>
        
        <section className="mb-8">
          <p className="text-lg mb-4 leading-relaxed">
            Taskboard is a simple, intuitive task management tool designed to feel like your favorite paper notebook, 
            but with the power of modern digital collaboration.
          </p>
          <p className="mb-4 leading-relaxed">
            Built with a focus on speed and clarity, Taskboard helps you organize your thoughts, 
            collaborate with your team, and keep your projects on track without the clutter of 
            traditional project management software.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">Key Features</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Flexible Views:</strong> Switch between Kanban boards and simple Lists to suit your workflow.</li>
            <li><strong>Real-time Collaboration:</strong> Share workspaces and projects with team members or guests.</li>
            <li><strong>Google Sheets Sync:</strong> Seamlessly sync your tasks to and from Google Sheets for advanced reporting or backup.</li>
            <li><strong>Privacy First:</strong> Your data is yours. We strictly adhere to security best practices and Google's Limited Use policy.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">Our Philosophy</h2>
          <p className="italic text-ink-soft leading-relaxed">
            "Tools should get out of the way. We believe that productivity isn't about more features, 
            it's about less friction."
          </p>
        </section>

        <div className="mt-8 pt-8 border-t border-ink/10 text-center flex flex-wrap justify-center gap-6">
          <a href="#/privacy" className="text-pen-blue hover:underline font-hand text-lg">Privacy Policy</a>
          <a href="#/" className="text-pen-blue hover:underline font-hand text-lg">Return to Home</a>
        </div>
      </div>
    </div>
  );
}
