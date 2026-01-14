import SwiftUI

struct PlannerListView: View {
    // Mock Data
    @State var events = [
        PlannerEvent(id: 1, title: "Esercizi Mat 20-30", subject: "Matematica", type: .homework, date: "Oggi", isCompleted: false),
        PlannerEvent(id: 2, title: "Studiare Cap. 4", subject: "Storia", type: .homework, date: "Oggi", isCompleted: true),
        PlannerEvent(id: 3, title: "Verifica Sommativa", subject: "Fisica", type: .exam, date: "Domani", isCompleted: false),
        PlannerEvent(id: 4, title: "Portare autorizzazione", subject: "Segreteria", type: .note, date: "Domani", isCompleted: false)
    ]
    
    var body: some View {
        NavigationView {
            ZStack {
                DesignSystem.Colors.background.ignoresSafeArea()
                
                List {
                    Section(header: Text("OGGI").font(.headline).foregroundColor(DesignSystem.Colors.accent)) {
                        ForEach($events.filter { $0.date.wrappedValue == "Oggi" }) { $event in
                            PlannerEventRow(event: $event)
                        }
                    }
                    .listRowBackground(Color.clear)
                    
                    Section(header: Text("DOMANI").font(.headline).foregroundColor(DesignSystem.Colors.textSecondary)) {
                        ForEach($events.filter { $0.date.wrappedValue == "Domani" }) { $event in
                            PlannerEventRow(event: $event)
                        }
                    }
                    .listRowBackground(Color.clear)
                }
                .listStyle(PlainListStyle())
                .navigationTitle("Planner")
            }
        }
    }
}

struct PlannerEvent: Identifiable {
    let id: Int
    let title: String
    let subject: String
    let type: EventType
    let date: String
    var isCompleted: Bool
    
    enum EventType {
        case homework, exam, note
        
        var color: Color {
            switch self {
            case .homework: return Color.blue
            case .exam: return Color.red
            case .note: return Color.orange
            }
        }
        
        var icon: String {
            switch self {
            case .homework: return "book"
            case .exam: return "graduationcap"
            case .note: return "note.text"
            }
        }
    }
}

struct PlannerEventRow: View {
    @Binding var event: PlannerEvent
    
    var body: some View {
        HStack(spacing: 16) {
            // Checkbox
            Button(action: { event.isCompleted.toggle() }) {
                Image(systemName: event.isCompleted ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundColor(event.isCompleted ? .green : DesignSystem.Colors.textSecondary)
            }
            .buttonStyle(PlainButtonStyle())
            
            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(event.title)
                    .font(.headline)
                    .strikethrough(event.isCompleted)
                    .foregroundColor(event.isCompleted ? DesignSystem.Colors.textSecondary : DesignSystem.Colors.textPrimary)
                
                HStack {
                    Image(systemName: event.type.icon)
                        .font(.caption)
                    Text(event.subject)
                        .font(.subheadline)
                }
                .foregroundColor(event.type.color)
            }
            
            Spacer()
        }
        .padding()
        .background(DesignSystem.Colors.cardBackground)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(DesignSystem.Colors.border, lineWidth: 1)
        )
        .padding(.vertical, 4)
    }
}
